import type pg from 'pg';
import {
  appConfig,
  buildSubject,
  checkPermission,
  type ContextEntityIdColumns,
  type ContextEntityType,
  entityMetadata,
  hierarchy,
  isContextEntity,
  isProductEntity,
  membershipMetadata,
  type PermissionMembership,
  type ProductEntityType,
} from 'shared';
import type { DocContext } from '../constants';
import { withClient } from './db';

/**
 * Load the user's memberships in the shape the permission engine expects.
 *
 * Runs on an RLS-scoped client (tenant + user already set by {@link withClient}), so the result is
 * naturally limited to the active tenant. Only the three columns the engine reads are selected.
 */
export async function loadMemberships(client: pg.PoolClient, userId: string): Promise<PermissionMembership[]> {
  const c = membershipMetadata.columns;
  const projection = `"${c.contextType}" AS "contextType", "${c.contextId}" AS "contextId", "${c.role}" AS "role"`;
  const { rows } = await client.query<PermissionMembership>(
    `SELECT ${projection} FROM "${membershipMetadata.table}" WHERE "${c.userId}" = $1`,
    [userId],
  );
  return rows;
}

/** Entity row carrying just the ancestor scope and ownership columns the permission engine needs. */
export interface EntityScopeRow extends Partial<ContextEntityIdColumns> {
  id: string;
  createdBy?: string | null;
  tenantId?: string | null;
}

/**
 * Resolve an entity's ancestor scope (e.g. `organizationId`), `createdBy`, and `tenantId`.
 *
 * Reads only the columns the permission engine needs from the entity's table. Column and table names
 * come from the trusted drizzle registry (never user input); the entity id is parameterized.
 * Returns `null` if the entity type is not collaboratively editable or the row does not exist.
 */
export async function resolveEntityScope(
  client: pg.PoolClient,
  entityType: ContextEntityType | ProductEntityType,
  entityId: string,
): Promise<EntityScopeRow | null> {
  const meta = entityMetadata[entityType];
  if (!meta) return null;
  const columns = meta.columns;

  const selectKeys = new Set<string>(['id']);
  if (columns.createdBy) selectKeys.add('createdBy');
  if (columns.tenantId) selectKeys.add('tenantId');
  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    const idKey = appConfig.entityIdColumnKeys[ancestor];
    if (columns[idKey]) selectKeys.add(idKey);
  }

  const projection = [...selectKeys].map((key) => `"${columns[key]}" AS "${key}"`).join(', ');
  const { rows } = await client.query<EntityScopeRow>(
    `SELECT ${projection} FROM "${meta.table}" WHERE "${columns.id}" = $1 LIMIT 1`,
    [entityId],
  );
  return rows[0] ?? null;
}

/**
 * Decide locally whether the user may edit the document's entity.
 *
 * Mirrors the backend `verifyEntityOp`: resolves the entity scope and memberships in one RLS-scoped
 * connection, then runs the shared permission engine for the `update` action. The decision is computed
 * by exactly the same engine the backend uses — no HTTP round-trip.
 *
 * @throws MissingScopeError if the resolved entity is missing a required ancestor scope.
 */
export async function canEditEntity(ctx: DocContext): Promise<boolean> {
  if (!isContextEntity(ctx.entityType) && !isProductEntity(ctx.entityType)) return false;
  const entityType = ctx.entityType as ContextEntityType | ProductEntityType;

  return withClient(ctx.tenantId, ctx.userId, async (client) => {
    const [entity, memberships] = await Promise.all([
      resolveEntityScope(client, entityType, ctx.entityId),
      loadMemberships(client, ctx.userId),
    ]);

    if (!entity) return false;

    // Defense-in-depth: verify tenant match even if RLS is not enforced (e.g. superuser connection).
    if (typeof entity.tenantId === 'string' && entity.tenantId !== ctx.tenantId) return false;

    const createdBy = typeof entity.createdBy === 'string' || entity.createdBy === null ? entity.createdBy : undefined;
    const subject = buildSubject(entityType, entity, { id: entity.id, createdBy });
    const { isAllowed } = checkPermission(memberships, 'update', subject);
    return isAllowed;
  });
}
