import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {requireUser} from '../../../supabase/requireUser';
import {QuerySliceDependencies} from '../../../common/dependencies';
import {TasksReadModel, tableName} from './TasksProjection';

export const api =
    ({db, authenticate}: QuerySliceDependencies): WebApiSetup =>
    (router: Router): void => {
        router.get('/api/query/tasks-collection', async (req: Request, res: Response) => {
            const principal = await requireUser(req, res, authenticate);
            if (principal.error) return;

            const id = req.query._id?.toString();

            const tasks = db<TasksReadModel>(tableName).withSchema('public');
            const data = id ? await tasks.where({id}).first() : await tasks.select();

            return res.status(200).json(data ?? (id ? null : []));
        });
    };
