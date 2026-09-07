import {expectNewEvents, expectResponse} from '@event-driven-io/emmett-expressjs';
import type {TestRequest} from '@event-driven-io/emmett-expressjs';
import {TodoListEvents, toTodoListStreamId} from '../slices/todolist/TodoListEvents';

export type RequestOptions = {token?: string; correlationId?: string};

const withHeaders = <T extends {set: (field: string, value: string) => T}>(
    request: T,
    {token, correlationId}: RequestOptions = {},
): T => {
    const authenticated = token ? request.set('Authorization', `Bearer ${token}`) : request;
    return correlationId ? authenticated.set('correlation_id', correlationId) : authenticated;
};

export const get =
    (path: string, options?: RequestOptions): TestRequest =>
    (request) =>
        withHeaders(request.get(path), options);

export const defineList =
    (id: string, body: object = {name: 'Groceries'}, options?: RequestOptions): TestRequest =>
    (request) =>
        withHeaders(request.post(`/api/definelist/${id}`), options).send(body);

export const addTask =
    (id: string, body: object = {name: 'Buy milk'}, options?: RequestOptions): TestRequest =>
    (request) =>
        withHeaders(request.post(`/api/addtask/${id}`), options).send(body);

export const resolveTask =
    (id: string, options?: RequestOptions): TestRequest =>
    (request) =>
        withHeaders(request.post(`/api/resolvetask/${id}`), options).send({});

export const deleteTask =
    (id: string, options?: RequestOptions): TestRequest =>
    (request) =>
        withHeaders(request.post(`/api/deletetask/${id}`), options).send({});

export const getTasks =
    (options?: RequestOptions): TestRequest =>
    (request) =>
        withHeaders(request.get('/api/query/tasks-collection'), options);

export const getTask =
    (id: string, options?: RequestOptions): TestRequest =>
    (request) =>
        withHeaders(request.get('/api/query/tasks-collection'), options).query({_id: id});

export const getTodoLists =
    (options?: RequestOptions): TestRequest =>
    (request) =>
        withHeaders(request.get('/api/query/todolists-collection'), options);

export const getTodoList =
    (id: string, options?: RequestOptions): TestRequest =>
    (request) =>
        withHeaders(request.get('/api/query/todolists-collection'), options).query({_id: id});

/** Every command route answers 201 with the new stream version. */
export const created = (
    streamVersion: number,
    headers?: {correlationId: string; causationId: string},
) =>
    expectResponse(201, {
        body: {ok: true, next_expected_stream_version: `${streamVersion}`},
        ...(headers
            ? {headers: {correlation_id: headers.correlationId, causation_id: headers.causationId}}
            : {}),
    });

export const appended = (id: string, events: TodoListEvents[]) =>
    expectNewEvents(toTodoListStreamId(id), events);

export const unauthorized = () =>
    expectResponse(401, {body: {error: 'Missing authorization token'}});

/** The same vocabulary, with every request carrying the caller's token. */
export const authenticatedAs = (token: string) => ({
    get:
        (path: string): TestRequest =>
        (request) =>
            withHeaders(request.get(path), {token}),
    defineList: (id: string, body?: object) => defineList(id, body, {token}),
    addTask: (id: string, body?: object) => addTask(id, body, {token}),
    resolveTask: (id: string) => resolveTask(id, {token}),
    deleteTask: (id: string) => deleteTask(id, {token}),
    getTasks: () => getTasks({token}),
    getTask: (id: string) => getTask(id, {token}),
    getTodoLists: () => getTodoLists({token}),
    getTodoList: (id: string) => getTodoList(id, {token}),
});
