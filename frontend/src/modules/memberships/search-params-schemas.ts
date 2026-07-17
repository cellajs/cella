import { zGetMembersQuery } from 'sdk/zod.gen';
import z from 'zod';

/**
 * Default list view state — the single source for URL stripping (route search middleware)
 * and query fallbacks. Mirrors the defaults in `zGetMembersQuery`.
 */
export const membersSearchDefaults = { q: '', sort: 'createdAt', order: 'desc' } as const;

/**
 * Search params schema for members route.
 */
export const membersRouteSearchParamsSchema = zGetMembersQuery
  .pick({ q: true, sort: true, order: true, role: true })
  .extend({ userSheetId: z.string().optional() });
