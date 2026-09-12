import {readFileSync} from 'fs';
import {join} from 'path';
import pg from 'pg';
import {Network} from 'testcontainers';
import {PostgreSqlContainer} from '@testcontainers/postgresql';
import {defaultMigrationsPath, flywayMigrate} from './flywayMigrate';

const postgresImage = 'postgres';
const postgresAlias = 'postgres-test-database';

export type PostgresTestDatabase = {
    connectionString: string;
    stop: () => Promise<void>;
};

export const startPostgresTestDatabase = async (): Promise<PostgresTestDatabase> => {
    const network = await new Network().start();

    const postgres = await new PostgreSqlContainer(postgresImage)
        .withNetwork(network)
        .withNetworkAliases(postgresAlias)
        .start();

    const connectionString = postgres.getConnectionUri();

    try {
        await applySupabaseStubs(connectionString);

        await flywayMigrate({
            network,
            host: postgresAlias,
            database: postgres.getDatabase(),
            username: postgres.getUsername(),
            password: postgres.getPassword(),
        });
    } catch (error) {
        await postgres.stop();
        await network.stop();
        throw error;
    }

    return {
        connectionString,
        stop: async () => {
            await postgres.stop();
            await network.stop();
        },
    };
};

const applySupabaseStubs = async (connectionString: string): Promise<void> => {
    const stubs = readFileSync(join(defaultMigrationsPath, '_V0__supabase_stubs.sql'), 'utf8');
    const client = new pg.Client({connectionString});

    await client.connect();
    try {
        await client.query(stubs);
    } finally {
        await client.end();
    }
};
