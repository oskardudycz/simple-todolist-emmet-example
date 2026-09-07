import {join} from 'path';
import {configureApplication, startAPI, WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {glob} from 'glob';
import express, {Application, Request, Response} from 'express';
import {jsonReplacer} from './src/common/json';
import {Authenticate, requireUser, supabaseAuthenticate} from './src/supabase/requireUser';
import {endPgPool, getPgPool, postgresUrl} from './src/common/db';
import swaggerUi from 'swagger-ui-express';
import {specs} from './src/swagger';
import cors from 'cors';
import {findEventstore} from './src/common/loadPostgresEventstore';
import {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import {CommandSliceDependencies, QuerySliceDependencies} from './src/common/dependencies';

export const createApp = async (options?: {
    eventStore?: PostgresEventStore;
    authenticate?: Authenticate;
}): Promise<Application> => {
    const eventStore = options?.eventStore ?? (await findEventstore());
    const authenticate = options?.authenticate ?? supabaseAuthenticate;
    const pool = getPgPool(postgresUrl);

    const slicesBase = join(__dirname, 'dist/src/slices');
    const routesPattern = join(slicesBase, '**/routes{,-*}.js');

    const routeFiles = await glob(routesPattern, {nodir: true});
    console.log('Found route files:', routeFiles);

    const processorPattern = join(slicesBase, '**/processor{,-*}.js');
    const processorFiles = await glob(processorPattern, {nodir: true});
    console.log('Found processor files:', processorFiles);

    // Common routes (e.g. projection replay) are privileged/operational and are
    // only mounted when explicitly enabled via env.
    const commonRoutesEnabled = process.env.COMMON_ROUTES_ENABLED === 'true';
    const commonPattern = join(__dirname, 'src/common/routes{,-*}.@(ts|js)');
    const commonRouteFiles = commonRoutesEnabled ? await glob(commonPattern, {nodir: true}) : [];
    console.log(
        commonRoutesEnabled
            ? `Found common route files: ${commonRouteFiles}`
            : 'Common routes disabled (set COMMON_ROUTES_ENABLED=true to enable)',
    );

    const webApis: WebApiSetup[] = [];

    for (const file of routeFiles.concat(commonRouteFiles)) {
        const webApiModule: {
            api: (dependencies: CommandSliceDependencies & QuerySliceDependencies) => WebApiSetup;
        } = await import(file);
        if (typeof webApiModule.api == 'function') {
            webApis.push(webApiModule.api({eventStore, pool, authenticate}));
        } else {
            console.error(`Expected api function to be defined in ${file}`);
        }
    }

    const startedProcessors: Array<{stop: () => Promise<void>}> = [];

    for (const processorFile of processorFiles) {
        const processor: {
            processor: {
                start: (eventStore: PostgresEventStore) => Promise<void>;
                stop: () => Promise<void>;
            };
        } = await import(processorFile);
        if (typeof processor.processor.start == 'function') {
            console.log(`starting processor ${processorFile}`);
            processor.processor
                .start(eventStore)
                .catch((err) => console.error(`Processor ${processorFile} failed:`, err));
            startedProcessors.push(processor.processor);
        }
    }

    const shutdown = async (signal: string) => {
        console.log(`${signal} received, shutting down processors...`);
        await Promise.allSettled(startedProcessors.map((p) => p.stop()));
        await eventStore.close();
        await endPgPool({connectionString: postgresUrl});
        console.log('shutdown complete');
        process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    const app: Application = express();
    app.set('json replacer', jsonReplacer);

    const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()) ?? [
        'http://localhost:3000',
        'http://localhost:3001',
    ];
    app.use(
        cors({
            origin: corsOrigins,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: [
                'Content-Type',
                'Content-Encoding',
                'accept-encoding',
                'Authorization',
                'x-user-id',
                'x-causation-id',
                'x-correlation-id',
            ],
        }),
    );

    app.use((req: Request, _res: Response, next) => {
        console.log(`[${req.method}] ${req.path}`);
        next();
    });

    // Swagger UI endpoints
    app.use('/api-docs', swaggerUi.serve);
    app.get(
        '/api-docs',
        swaggerUi.setup(specs, {
            swaggerOptions: {
                urls: [
                    {
                        url: '/swagger.json',
                        name: 'JSON',
                    },
                ],
            },
        }),
    );

    // OpenAPI spec endpoint
    app.get('/swagger.json', (req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(specs);
    });

    // Closed-by-default auth gate: every route below requires a valid Supabase JWT.
    // The public routes above are registered before it, which is what exempts them.
    app.use(async (req: Request, res: Response, next) => {
        if (req.method === 'OPTIONS') return next(); // CORS preflight
        // sends 401 on failure
        const {error} = await requireUser(req, res, authenticate);
        if (error) return; // response already sent
        next();
    });

    // Protected user info endpoint - requires JWT token in Authorization header
    app.get('/api/user', async (req: Request, res: Response) => {
        const result = await authenticate(req);
        if (result.error !== null) {
            res.status(401).json({error: result.error});
        } else {
            res.status(200).json({
                user_id: result.user.id,
                email: result.user.email,
                metadata: result.user.user_metadata,
            });
        }
    });

    configureApplication(app, {
        apis: webApis,
        enableDefaultExpressEtag: true,
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('⛔ Unhandled Rejection:', reason);
        if (reason instanceof Error && reason.stack) {
            console.error('Stack trace:\n', reason.stack);
        }
    });

    return app;
};

const startServer = async () => {
    const port = parseInt(process.env.PORT || '3000', 10);
    console.log(`> Ready on port ${port}`);

    // Start the main application
    startAPI(await createApp(), {port: port});
};

if (require.main === module) {
    startServer().catch((error) => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
}
