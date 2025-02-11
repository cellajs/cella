import { config } from 'config';
import { usersTable } from '#/db/schema/users';
import { extractKeys, omitKeys } from '#/utils/schema-tools';

/**
 * Safe user select. Sensitive fields are omitted.
 */
export const userSelect = omitKeys(usersTable, config.sensitiveFields);

/**
 * Limited user select. Include min info.
 */
export const limitUserSelect = extractKeys(usersTable, ['id', 'name', 'email', 'entity', 'thumbnailUrl', 'bannerUrl']);
