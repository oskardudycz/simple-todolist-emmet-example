import type pg from 'pg';
import type {Authenticate} from '../supabase/requireUser';

export type SliceDeps = {
    authenticate?: Authenticate;
    pool?: pg.Pool;
};
