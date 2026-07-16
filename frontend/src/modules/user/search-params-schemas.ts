import { zGetUsersQuery } from 'sdk/zod.gen';
import z from 'zod';

/**
 * Default list view state — the single source for URL stripping (route search middleware)
 * and query fallbacks. Mirrors the defaults in `zGetUsersQuery`.
 */
export const usersSearchDefaults = { q: '', sort: 'createdAt', order: 'desc' } as const;

/**
 * Search params schema for users route.
 */
export const usersRouteSearchParamsSchema = zGetUsersQuery
  .pick({ q: true, sort: true, order: true, role: true })
  .extend({ userSheetId: z.string().optional() });
