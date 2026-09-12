import {getPostgreSQLEventStore} from "@event-driven-io/emmett-postgresql";
import {pgEventStoreDriver} from "@event-driven-io/emmett-postgresql/pg";
import {projections} from "@event-driven-io/emmett";
import {postgresUrl, getSharedPool} from "./db";
import {TodoListsProjection} from "../slices/todolist/todolists/TodoListsProjection";
import {TasksProjection} from "../slices/todolist/tasks/TasksProjection";

let eventStoreInstance: ReturnType<typeof getPostgreSQLEventStore> | null = null;

export const findEventstore = async () => {
    if (!eventStoreInstance) {
        eventStoreInstance = getPostgreSQLEventStore({
            driver: pgEventStoreDriver,
            connectionString: postgresUrl,
            schema: {
                autoMigration: "CreateOrUpdate"
            },
            connectionOptions: {
                pooled: true,
                pool: getSharedPool(),
            },
            projections: projections.inline([
                TodoListsProjection,
                TasksProjection,
            ]),
        });
        await eventStoreInstance.schema.migrate();
    }
    return eventStoreInstance;
};
