// Search query schemas

import z from 'zod';
import { zGetAttachmentsData, zGetMembersData, zGetOrganizationsData, zGetRequestsData, zGetUsersData } from '~/api.gen/zod.gen';

/**
 * Search params schema for members route.
 */
export const membersRouteSearchParamsSchema = zGetMembersData.shape.query
  .pick({ q: true, sort: true, order: true, role: true })
  .extend({ userSheetId: z.string().optional() });

/**
 * Search params schema for organizations route.
 */
export const organizationsRouteSearchParamsSchema = zGetOrganizationsData.shape.query.unwrap().pick({ q: true, sort: true, order: true });

/**
 * Search params schema for users route.
 */
export const usersRouteSearchParamsSchema = zGetUsersData.shape.query
  .unwrap()
  .pick({ q: true, sort: true, order: true, role: true })
  .extend({ userSheetId: z.string().optional() });

/**
 * Search params schema for requests route.
 */
export const requestsRouteSearchParamsSchema = zGetRequestsData.shape.query.unwrap().pick({ q: true, sort: true, order: true });

/**
 * Search params schema for attachments route.
 */
export const attachmentsRouteSearchParamsSchema = zGetAttachmentsData.shape.query.unwrap().pick({ q: true, sort: true, order: true }).extend({
  attachmentDialogId: z.string().optional(),
  groupId: z.string().optional(),
});
