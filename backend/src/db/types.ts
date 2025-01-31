import type { ContextEntity } from 'config';
import type { entityIdFields } from '#/entity-config';
import type { safeUserSelect, usersTable } from './schema/users';

export type ContextEntityIdFields = {
  [K in keyof typeof entityIdFields]: K extends ContextEntity ? (typeof entityIdFields)[K] : never;
}[keyof typeof entityIdFields];

type SafeQuery = typeof safeUserSelect;
type UnsafeQuery = typeof usersTable;

export type SafeField = Extract<keyof SafeQuery, keyof SafeQuery['_']['columns']>;
export type UnsafeField = Extract<keyof UnsafeQuery, keyof UnsafeQuery['_']['columns']>;
