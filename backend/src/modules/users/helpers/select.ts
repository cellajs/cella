import { config } from 'config';
import { usersTable } from '#/db/schema/users';
import { omitKeys } from '#/utils/omit';

export const userSelect = omitKeys(usersTable, config.sensitiveFields);
