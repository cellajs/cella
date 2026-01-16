import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { json } from 'drizzle-orm/pg-core';

/**
 * Permission value: 1 = allowed, 0 = denied.
 */
export type PermissionValue = 0 | 1;

/**
 * Entity action permissions mapping each action to a permission value.
 * Example: { create: 1, read: 1, update: 0, delete: 0, search: 1 }
 */
export type EntityActionPermissions = {
  [K in (typeof appConfig.entityActions)[number]]: PermissionValue;
};

/**
 * Permissions object mapping each entity role to its action permissions.
 * Example: { admin: { create: 1, read: 1, update: 1, delete: 1, search: 1 }, member: { create: 0, read: 1, update: 0, delete: 0, search: 1 } }
 */
export type EntityPermissions = {
  [R in (typeof appConfig.roles.entityRoles)[number]]: EntityActionPermissions;
};

/**
 * Creates default permissions where all actions are denied (0) for all roles.
 */
export const createDefaultPermissions = (): EntityPermissions => {
  const permissions = {} as EntityPermissions;

  for (const role of appConfig.roles.entityRoles) {
    permissions[role] = {} as EntityActionPermissions;
    for (const action of appConfig.entityActions) {
      permissions[role][action] = 0;
    }
  }

  return permissions;
};

/**
 * Creates permissions column for context entity tables.
 * Stores role-based action permissions as JSON.
 */
export const entityPermissionsColumns = () => ({
  permissions: json().$type<EntityPermissions>().notNull().default(createDefaultPermissions()),
});

// ─────────────────────────────────────────────────────────────────────────────
// Zod schema for API validation
// ─────────────────────────────────────────────────────────────────────────────

const permissionValueSchema = z
  .union([z.literal(0), z.literal(1)])
  .openapi({ type: 'integer', enum: [0, 1], description: '0 = denied, 1 = allowed' });

const actionPermissionsSchema = z.object(
  Object.fromEntries(appConfig.entityActions.map((action) => [action, permissionValueSchema])) as {
    [K in (typeof appConfig.entityActions)[number]]: typeof permissionValueSchema;
  },
);

/**
 * Zod schema for entity permissions validation.
 */
export const entityPermissionsSchema = z.object(
  Object.fromEntries(appConfig.roles.entityRoles.map((role) => [role, actionPermissionsSchema])) as {
    [R in (typeof appConfig.roles.entityRoles)[number]]: typeof actionPermissionsSchema;
  },
);
