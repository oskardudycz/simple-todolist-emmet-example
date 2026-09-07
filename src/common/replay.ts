import {NotFoundError} from '@event-driven-io/emmett';
import {rebuildPostgreSQLProjections} from '@event-driven-io/emmett-postgresql';
import {postgresUrl} from './db';
import {projectionRegistry} from '../slices/projections';

export const replayProjection = async (
    projectionName: string,
    connectionString: string = postgresUrl,
): Promise<void> => {
    const projection = projectionRegistry[projectionName];
    if (!projection) throw new NotFoundError({id: projectionName, type: 'Projection'});

    const consumer = rebuildPostgreSQLProjections({projection, connectionString});

    try {
        await consumer.start();
    } finally {
        await consumer.close();
    }
};
