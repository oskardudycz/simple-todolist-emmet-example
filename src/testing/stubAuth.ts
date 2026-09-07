import type {Authenticate} from '../supabase/requireUser';

export const allowAnyUser: Authenticate = async () => ({
    user: {
        id: 'test-user',
        email: 'test@example.com',
        user_metadata: {},
        app_metadata: {},
        aud: 'authenticated',
        created_at: '2025-01-01T00:00:00.000Z',
    },
    error: null,
});

export const rejectAll: Authenticate = async () => ({
    user: null,
    error: 'MISSING_TOKEN',
});
