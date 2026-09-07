import {getSharedPool} from './db';
import {sql} from './sql';
import type {
    AnyMessage,
    AnyRecordedMessageMetadata,
    RecordedMessage,
} from '@event-driven-io/emmett';

export const storeDlqMessage = async (
    processorId: string,
    message: RecordedMessage<AnyMessage, AnyRecordedMessageMetadata>,
    error: unknown,
): Promise<void> => {
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
                event: JSON.parse(
                    JSON.stringify(
                        {type: message.type, data: message.data, metadata: message.metadata},
                        (key, value) => (typeof value === 'bigint' ? value.toString() : value),
                    ),
                ),
                error: error instanceof Error ? error.message : String(error),
            })
            .toSQL()
            .toNative();

        await getSharedPool().query(text, bindings as unknown[]);
    } catch (dlqError) {
        console.error('Failed to write to processor_dlq:', dlqError);
    }
};
