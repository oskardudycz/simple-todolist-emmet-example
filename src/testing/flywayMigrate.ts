import {resolve} from 'path';
import {Readable} from 'stream';
import {GenericContainer, StartedNetwork, Wait} from 'testcontainers';

const flywayImage = 'flyway/flyway:11-alpine';

export type FlywayMigrateOptions = {
    network: StartedNetwork;
    host: string;
    port?: number;
    database: string;
    username: string;
    password: string;
    migrationsPath?: string;
};

export const defaultMigrationsPath = resolve(__dirname, '..', '..', 'supabase', 'migrations');

export const flywayMigrate = async (options: FlywayMigrateOptions): Promise<void> => {
    const {network, host, port = 5432, database, username, password} = options;
    const migrationsPath = options.migrationsPath ?? defaultMigrationsPath;
    const jdbcUrl = `jdbc:postgresql://${host}:${port}/${database}`;

    const logs: string[] = [];
    let logsFinished: Promise<void> = Promise.resolve();

    const container = new GenericContainer(flywayImage)
        .withNetwork(network)
        .withBindMounts([{source: migrationsPath, target: '/flyway/sql', mode: 'ro'}])
        .withCommand([
            `-url=${jdbcUrl}`,
            `-user=${username}`,
            `-password=${password}`,
            '-locations=filesystem:/flyway/sql',
            '-schemas=public',
            '-baselineOnMigrate=true',
            '-placeholderReplacement=false',
            '-validateOnMigrate=true',
            '-connectRetries=30',
            'migrate',
        ])
        .withLogConsumer((stream: Readable) => {
            logsFinished = new Promise<void>((done) => {
                stream.on('data', (chunk) => logs.push(chunk.toString()));
                stream.on('err', (chunk) => logs.push(chunk.toString()));
                stream.on('end', () => done());
                stream.on('close', () => done());
                stream.on('error', () => done());
            });
        })
        .withWaitStrategy(Wait.forOneShotStartup())
        .withStartupTimeout(180_000);

    try {
        const started = await container.start();
        await started.stop();
    } catch (error) {
        // The container is already gone when the one-shot wait fails, so the only
        // record of what Flyway said is what the log consumer buffered.
        await Promise.race([logsFinished, new Promise((done) => setTimeout(done, 5_000))]);
        const output = logs.join('').trim();
        throw new Error(
            `Flyway migration failed: ${error instanceof Error ? error.message : String(error)}\n${output}`,
        );
    }
};
