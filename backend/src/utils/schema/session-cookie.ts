import { z } from 'zod';

/**
 * Schema for session cookie
 */
export const sessionCookieSchema = z.object({ sessionToken: z.string(), adminUserId: z.string().optional() });
