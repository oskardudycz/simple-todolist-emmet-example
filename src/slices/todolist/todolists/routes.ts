import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {requireUser} from '../../../supabase/requireUser';
import {getKnexInstance} from '../../../common/db';
import {TodoListsReadModel, tableName} from './TodoListsProjection';

export const api =
    (): WebApiSetup =>
    (router: Router): void => {
        router.get('/api/query/todolists-collection', async (req: Request, res: Response) => {
            try {
                const principal = await requireUser(req, res, true);
                if (principal.error) return;

                const id = req.query._id?.toString();
                const db = getKnexInstance();

                const query = db<TodoListsReadModel>(tableName).withSchema('public');
                const data = id ? await query.where({id}).first() : await query.select();

                return res.status(200).json(data ?? (id ? null : []));
            } catch (err) {
                console.error(err);
                return res.status(500).json({ok: false, error: 'Server error'});
            }
        });
    };
