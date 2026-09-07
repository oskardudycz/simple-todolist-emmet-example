import {createAuthenticatedClient} from './api';
import type {User} from '@supabase/supabase-js';
import {Request, Response} from 'express';

export type RequireUserResult =
    | {
          user: User;
          error: null;
      }
    | {
          user: null;
          error: string;
      };

export type Authenticate = (req: Request) => Promise<RequireUserResult>;

/**
 * Extracts JWT token from Authorization header
 * Supports "Bearer <token>" format
 */
function extractTokenFromHeader(req: Request): string | null {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return null;
    }

    // Check for "Bearer <token>" format
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        return parts[1];
    }

    // If no Bearer prefix, assume the entire header is the token
    return authHeader;
}

/**
 * Resolves the caller from the Authorization header against Supabase.
 * Never touches the response - the caller decides what to send.
 */
export const supabaseAuthenticate: Authenticate = async (
    req: Request,
): Promise<RequireUserResult> => {
    const token = extractTokenFromHeader(req);

    if (!token) {
        return {
            user: null,
            error: 'MISSING_TOKEN',
        };
    }

    const supabase = await createAuthenticatedClient(req);

    // Verify the JWT token
    const {
        data: {user},
        error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
        return {
            user: null,
            error: error?.message || 'UNAUTHORIZED',
        };
    }

    return {
        user: user,
        error: null,
    };
};

/**
 * Verifies JWT token from Authorization header and returns user info
 * This is for backend API use - does not use cookies or redirects
 */
export async function requireUser(
    req: Request,
    resp: Response,
    authenticate: Authenticate = supabaseAuthenticate,
): Promise<RequireUserResult> {
    const result = await authenticate(req);

    if (result.error === 'MISSING_TOKEN') {
        resp.status(401).json({error: 'Missing authorization token'});
        return result;
    }

    if (result.error) {
        resp.status(401).json({error: 'Invalid or expired token'});
        return result;
    }

    return result;
}
