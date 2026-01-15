import { appConfig } from 'config';
import type { ActivityAction } from '#/activities-config';

/**
 * Convert a CDC operation to an activity action.
 */
export const cdcOperationToAction: Record<string, ActivityAction> = {
  insert: 'create',
  update: 'update',
  delete: 'delete',
};

// Sanitize slug for use in PostgreSQL
const sanitizedSlug = appConfig.slug.replace(/-/g, '_');

/**
 * Publication name for CDC.
 */
export const CDC_PUBLICATION_NAME = `${sanitizedSlug}_cdc_pub`;

/**
 * Replication slot name for CDC.
 */
export const CDC_SLOT_NAME = `${sanitizedSlug}_cdc_slot`;
