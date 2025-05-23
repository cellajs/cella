import { config } from 'config';
import { usersTable } from '#/db/schema/users';
import { extractKeys } from '#/utils/schema/extract-keys';
import { omitKeys } from '#/utils/schema/omit-keys';

/**
 * Safe user select. Sensitive fields are omitted.
 */
export const userSelect = omitKeys(usersTable, config.sensitiveFields);

/**
 * User select for summary only.
 */
export const userSummarySelect = extractKeys(usersTable, ['id', 'name', 'email', 'entityType', 'thumbnailUrl', 'bannerUrl', 'slug']);
