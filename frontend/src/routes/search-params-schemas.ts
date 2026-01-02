// Search query schemas

import z from 'zod';
import {
  zGetMembersData,
  zGetOrganizationsData,
  zGetPagesData,
  zGetRequestsData,
  zGetUsersData,
} from '~/api.gen/zod.gen';

/**
 * Search params schema for members route.
 */
export const membersRouteSearchParamsSchema = zGetMembersData.shape.query
  .pick({ q: true, sort: true, order: true, role: true })
  .extend({ userSheetId: z.string().optional() });

/**
 * Search params schema for organizations route.
 */
export const organizationsRouteSearchParamsSchema = zGetOrganizationsData.shape.query
  .unwrap()
  .pick({ q: true, sort: true, order: true });

/**
 * Search params schema for users route.
 */
export const usersRouteSearchParamsSchema = zGetUsersData.shape.query
  .unwrap()
  .pick({ q: true, sort: true, order: true, role: true })
  .extend({ userSheetId: z.string().optional() });

/**
 * Search params schema for pages route.
 */
export const pagesRouteSearchParamsSchema = zGetPagesData.shape.query
  .unwrap()
  .pick({ q: true, sort: true, order: true });

/**
 * Search params schema for requests route.
 */
export const requestsRouteSearchParamsSchema = zGetRequestsData.shape.query
  .unwrap()
  .pick({ q: true, sort: true, order: true });

/**
 * Search params schema for attachments route.
 */
export const attachmentsRouteSearchParamsSchema = z.object({
  attachmentDialogId: z.string().optional(),
  groupId: z.string().optional(),
  q: z.string().optional(),
  order: z.optional(z.enum(['asc', 'desc'])),
  sort: z.enum(['id', 'name', 'size', 'createdAt']).default('createdAt').optional(),
});

/**
 * Search params schema for page route.
 */
export const pageRouteSearchParamsSchema = z.object({
  mode: z.enum(['view', 'edit']).default('view').catch('view'),
});
