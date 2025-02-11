import { config } from 'config';
import { usersTable } from '#/db/schema/users';
import { omitKeys } from '#/utils/omit';

/**
 * Safe user select. Sensitive fields are omitted.
 */
export const userSelect = omitKeys(usersTable, config.sensitiveFields);
