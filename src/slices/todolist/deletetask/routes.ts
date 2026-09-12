import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {requireUser} from '../../../supabase/requireUser';
import {DeleteTaskCommand, handleDeleteTask} from './DeleteTaskCommand';

export const api = (): WebApiSetup => (router: Router): void => {

    router.post('/api/deletetask/:id', async (req: Request<{id: string}>, res: Response) => {
        const auth = await requireUser(req, res);
        if (auth.error) return;

        const id = req.params.id;
        const correlationId = req.header('correlation_id') ?? id;

        try {
            const command: DeleteTaskCommand = {
                type: 'DeleteTask',
                data: {
                    id,
                },
                metadata: {
                    correlation_id: correlationId,
                    causation_id: id,
                },
            };

            const result = await handleDeleteTask(id, command);

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
