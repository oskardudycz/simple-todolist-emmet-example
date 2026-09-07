import pg from 'pg';

export const postgresUrl = process.env.SUPABASE_DB_URL ?? 'missing-url';

let sharedPool: pg.Pool | null = null;

export const getSharedPool = (): pg.Pool => {
    if (!sharedPool) {
        sharedPool = new pg.Pool({connectionString: postgresUrl, max: 5});
    }
    return sharedPool;
};

export const closeDb = async (): Promise<void> => {
    await sharedPool?.end();
    sharedPool = null;
};
