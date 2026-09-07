import type pg from 'pg';
import {sql} from './sql';
import type {
    AnyMessage,
    AnyRecordedMessageMetadata,
    RecordedMessage,
} from '@event-driven-io/emmett';

export const storeDlqMessage = async (
    pool: pg.Pool,
    processorId: string,
    message: RecordedMessage<AnyMessage, AnyRecordedMessageMetadata>,
    error: unknown,
): Promise<void> => {
    const event = JSON.parse(
        JSON.stringify(
            {type: message.type, data: message.data, metadata: message.metadata},
            (key, value) => (typeof value === 'bigint' ? value.toString() : value),
        ),
    );
    const errorMessage = error instanceof Error ? error.message : String(error);

    try {
        console.log(
            `Processing DLQ ${JSON.stringify(
                {type: message.type, data: message.data, metadata: message.metadata},
                (key, value) => (typeof value === 'bigint' ? value.toString() : value),
            )}`,
        );
        const {sql: text, bindings} = sql('processor_dlq')
            .insert({
                processor_id: processorId,
                stream_id: message.metadata.streamName,
                event,
                error: errorMessage,
            })
            .toSQL()
            .toNative();

        await pool.query(text, bindings as unknown[]);
    } catch (dlqError) {
        console.error('Failed to write to processor_dlq:', dlqError);
    }
};
