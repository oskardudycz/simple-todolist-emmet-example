import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {requireUser} from '../../../supabase/requireUser';
import {AddTaskCommand, handleAddTask} from './AddTaskCommand';

export const api =
    (): WebApiSetup =>
    (router: Router): void => {
        router.post('/api/addtask/:id', async (req: Request<{id: string}>, res: Response) => {
            const auth = await requireUser(req, res);
            if (auth.error) return;

            const id = req.params.id;
            const correlationId = req.header('correlation_id') ?? id;

            try {
                const command: AddTaskCommand = {
                    type: 'AddTask',
                    data: {
                        id,
                        name: req.body.name,
                    },
                    metadata: {
                        correlation_id: correlationId,
                        causation_id: id,
                    },
                };

                const result = await handleAddTask(id, command);

                res.set('correlation_id', correlationId);
                res.set('causation_id', id);

                return res.status(201).json({
                    ok: true,
                    next_expected_stream_version: result.nextExpectedStreamVersion?.toString(),
                    last_event_global_position: result.lastEventGlobalPosition?.toString(),
                });
            } catch (err) {
                console.error(err);
                return res.status(500).json({ok: false, error: 'Server error'});
            }
        });
    };
