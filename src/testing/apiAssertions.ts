import assert from 'assert';
import type {Response} from 'supertest';

/**
 * `expectResponse` skips the body check when the expected body is falsy, so a response
 * that must be JSON `null` cannot be expressed with it.
 */
export const expectNullBody =
    (statusCode: number = 200) =>
    (response: Response): void => {
        assert.strictEqual(response.statusCode, statusCode);
        assert.strictEqual(JSON.parse(response.text), null);
    };
