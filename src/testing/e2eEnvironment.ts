import {it} from 'node:test';
import type {Application} from 'express';
import {createClient} from '@supabase/supabase-js';
import {createApp} from '../../server';

export type E2EEnvironment =
    {available: true; app: Application; token: string} | {available: false; reason: string};

const requiredVariables = [
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_DB_URL',
    'SUPABASE_USER_EMAIL',
    'SUPABASE_USER_PASSWORD',
] as const;

const isPlaceholder = (value: string): boolean => value.includes('<');

const missingConfiguration = (): string | null => {
    const missing = requiredVariables.filter((name) => {
        const value = process.env[name];
        return !value || isPlaceholder(value);
    });

    return missing.length > 0
        ? `Supabase is not configured for e2e - missing or placeholder: ${missing.join(', ')}`
        : null;
};

const isReachable = async (url: string, apiKey: string): Promise<boolean> => {
    try {
        const response = await fetch(`${url}/auth/v1/health`, {
            headers: {apikey: apiKey},
            signal: AbortSignal.timeout(5_000),
        });
        return response.ok;
    } catch {
        return false;
    }
};

let resolved: Promise<E2EEnvironment> | null = null;

export const getE2EEnvironment = (): Promise<E2EEnvironment> => {
    resolved ??= resolveE2EEnvironment();
    return resolved;
};

const resolveE2EEnvironment = async (): Promise<E2EEnvironment> => {
    const missing = missingConfiguration();
    if (missing) return {available: false, reason: missing};

    const url = process.env.SUPABASE_URL!;
    const apiKey = process.env.SUPABASE_PUBLISHABLE_KEY!;

    if (!(await isReachable(url, apiKey))) {
        return {available: false, reason: `Supabase at ${url} is not reachable`};
    }

    const supabase = createClient(url, apiKey, {
        auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
    });

    const {data, error} = await supabase.auth.signInWithPassword({
        email: process.env.SUPABASE_USER_EMAIL!,
        password: process.env.SUPABASE_USER_PASSWORD!,
    });

    if (error || !data.session) {
        return {
            available: false,
            reason: `Could not sign the e2e user in: ${error?.message ?? 'no session'}`,
        };
    }

    return {available: true, app: await createApp(), token: data.session.access_token};
};

/**
 * `it` for a scenario that needs a reachable Supabase. Skipping in a `beforeEach` hook
 * marks the test skipped but still runs its body, so the guard has to wrap the body.
 */
export const scenarioRunner =
    (environment: () => E2EEnvironment) =>
    (name: string, run: () => Promise<void>): void => {
        it(name, async (t) => {
            const resolvedEnvironment = environment();

            if (!resolvedEnvironment.available) {
                t.skip(resolvedEnvironment.reason);
                return;
            }

            await run();
        });
    };
