import {Request, Response, Router} from 'express';
import {assertNotEmptyString} from '@event-driven-io/emmett';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {requireUser} from '../../../supabase/requireUser';
import {CommandSliceDependencies} from '../../../common/dependencies';
import {toTodoListStreamId} from '../TodoListEvents';
import {handleDeleteTask} from './DeleteTaskCommand';

export const api =
    ({eventStore, authenticate}: CommandSliceDependencies): WebApiSetup =>
    (router: Router): void => {
        router.post('/api/deletetask/:id', async (req: Request<{id: string}>, res: Response) => {
            const auth = await requireUser(req, res, authenticate);
            if (auth.error) return;

            const id = assertNotEmptyString(req.params.id);
            const correlationId = req.header('correlation_id') ?? id;

            const result = await handleDeleteTask(eventStore, toTodoListStreamId(id), {
                type: 'DeleteTask',
                data: {
                    id,
                },
                metadata: {
                    correlation_id: correlationId,
                    causation_id: id,
                },
            });

            res.set('correlation_id', correlationId);
            res.set('causation_id', id);

            return res.status(201).json({
                ok: true,
                next_expected_stream_version: result.nextExpectedStreamVersion?.toString(),
                last_event_global_position: result.lastEventGlobalPosition?.toString(),
            });
        });
    };
