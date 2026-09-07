import {Request, Response, Router} from 'express';
import {assertNotEmptyString} from '@event-driven-io/emmett';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import type {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import {requireUser} from '../../../supabase/requireUser';
import {SliceDeps} from '../../../common/deps';
import {toTodoListStreamId} from '../TodoListEvents';
import {handleDefineList} from './DefineListCommand';

export const api =
    (eventStore: PostgresEventStore, deps: SliceDeps = {}): WebApiSetup =>
    (router: Router): void => {
        router.post('/api/definelist/:id', async (req: Request<{id: string}>, res: Response) => {
            const auth = await requireUser(req, res, deps.authenticate);
            if (auth.error) return;

            const id = assertNotEmptyString(req.params.id);
            const correlationId = req.header('correlation_id') ?? id;

            const result = await handleDefineList(eventStore, toTodoListStreamId(id), {
                type: 'DefineList',
                data: {
                    id,
                    name: assertNotEmptyString(req.body.name),
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
