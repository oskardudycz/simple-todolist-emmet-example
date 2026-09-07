import {configureApplication, startAPI, WebApiSetup} from '@event-driven-io/emmett-expressjs';
import express, {Application, Request, Response} from 'express';
import {jsonReplacer} from './src/common/json';
import {Authenticate, requireUser, supabaseAuthenticate} from './src/supabase/requireUser';
import {closeDb} from './src/common/db';
import swaggerUi from 'swagger-ui-express';
import {specs} from './src/swagger';
import cors from 'cors';
import {findEventstore} from './src/common/loadPostgresEventstore';
import {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import {processors, slices} from './src/slices';
import {api as commonApi} from './src/common/routes';

export const createApp = async (options?: {
    eventStore?: PostgresEventStore;
    authenticate?: Authenticate;
}): Promise<Application> => {
    const eventStore = options?.eventStore ?? (await findEventstore());
    const authenticate = options?.authenticate ?? supabaseAuthenticate;

    // Common routes (e.g. projection replay) are privileged/operational and are
    // only mounted when explicitly enabled via env.
    const commonRoutesEnabled = process.env.COMMON_ROUTES_ENABLED === 'true';

    const webApis: WebApiSetup[] = slices.map((slice) => slice(eventStore, {authenticate}));
    if (commonRoutesEnabled) webApis.push(commonApi());

    const startedProcessors: Array<{stop: () => Promise<void>}> = [];

    for (const processor of processors) {
        processor.start(eventStore).catch((err) => console.error('Processor failed:', err));
        startedProcessors.push(processor);
    }

    const shutdown = async (signal: string) => {
        console.log(`${signal} received, shutting down processors...`);
        await Promise.allSettled(startedProcessors.map((p) => p.stop()));
        await eventStore.close();
        await closeDb();
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
