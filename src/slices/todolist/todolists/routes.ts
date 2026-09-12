import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {requireUser} from '../../../supabase/requireUser';
import {QuerySliceDependencies} from '../../../common/dependencies';
import {TodoListsReadModel, tableName} from './TodoListsProjection';

export const api =
    ({db, authenticate}: QuerySliceDependencies): WebApiSetup =>
    (router: Router): void => {
        router.get('/api/query/todolists-collection', async (req: Request, res: Response) => {
            const principal = await requireUser(req, res, authenticate);
            if (principal.error) return;

            const id = req.query._id?.toString();

            const todoLists = db<TodoListsReadModel>(tableName).withSchema('public');
            const data = id ? await todoLists.where({id}).first() : await todoLists.select();

            return res.status(200).json(data ?? (id ? null : []));
        });
    };
