import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {requireUser} from '../../../supabase/requireUser';
import {sql} from '../../../common/sql';
import {QuerySliceDependencies} from '../../../common/dependencies';
import {TodoListsReadModel, tableName} from './TodoListsProjection';

export const api =
    ({pool, authenticate}: QuerySliceDependencies): WebApiSetup =>
    (router: Router): void => {
        router.get('/api/query/todolists-collection', async (req: Request, res: Response) => {
            const principal = await requireUser(req, res, authenticate);
            if (principal.error) return;

            const id = req.query._id?.toString();

            const builder = sql<TodoListsReadModel>(tableName).withSchema('public');
            const query = id ? builder.where({id}).first() : builder.select();
            const {sql: text, bindings} = query.toSQL().toNative();

            const {rows} = await pool.query<TodoListsReadModel>(text, bindings as unknown[]);

            return res.status(200).json(id ? (rows[0] ?? null) : rows);
        });
    };
