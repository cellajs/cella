import { config } from 'config';
import { usersTable } from '#/db/schema/users';
import { extractKeys, omitKeys } from '#/utils/schema-tools';

/**
 * Safe user select. Sensitive fields are omitted.
 */
export const userSelect = omitKeys(usersTable, config.sensitiveFields);

/**
 * User select for summary only.
 * TODO: can we use existing base user schema?
 */
export const userSummarySelect = extractKeys(usersTable, ['id', 'name', 'email', 'entity', 'thumbnailUrl', 'bannerUrl', 'slug']);
