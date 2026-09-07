import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import type {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import {requireUser} from '../../../supabase/requireUser';
import {getSharedPool} from '../../../common/db';
import {sql} from '../../../common/sql';
import {SliceDeps} from '../../../common/deps';
import {TasksReadModel, tableName} from './TasksProjection';

export const api =
    (eventStore: PostgresEventStore, deps: SliceDeps = {}): WebApiSetup =>
    (router: Router): void => {
        router.get('/api/query/tasks-collection', async (req: Request, res: Response) => {
            const principal = await requireUser(req, res, deps.authenticate);
            if (principal.error) return;

            const id = req.query._id?.toString();

            const builder = sql<TasksReadModel>(tableName).withSchema('public');
            const query = id ? builder.where({id}).first() : builder.select();

            const {sql: text, bindings} = query.toSQL().toNative();
            const pool = deps.pool ?? getSharedPool();
            const {rows} = await pool.query<TasksReadModel>(text, bindings as unknown[]);

            return res.status(200).json(id ? (rows[0] ?? null) : rows);
        });
    };
