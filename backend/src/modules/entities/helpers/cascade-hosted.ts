import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import { hierarchy, type ProductEntityType } from 'shared';
import type { AuthContext } from '#/core/context';
import { entityTables } from '#/tables';

/** Structural shape a hosted product table must have for the cascade update. */
type HostedTable = AnyPgTable & {
  id: PgColumn;
  deletedAt: PgColumn;
  organizationId: PgColumn;
};

/**
 * Soft-delete all hosted rows of the given host rows (hierarchy `host:` relationships,
 * e.g. deleting tasks soft-deletes their attachments). The API-layer half of the
 * host lifecycle cascade — the CDC pipeline handles hard-delete suppression and host
 * counter deltas from the resulting tombstone events.
 *
 * Tombstones intentionally flow per hosted row (no event suppression here): delta-sync
 * clients need each one to drop cached rows.
 *
 * @returns The soft-deleted row ids per hosted entity type.
 */
export const cascadeSoftDeleteHosted = async (
  ctx: AuthContext,
  {
    hostType,
    hostIds,
    deletedAt,
    deletedBy,
  }: { hostType: ProductEntityType; hostIds: string[]; deletedAt: string; deletedBy: string },
): Promise<Partial<Record<ProductEntityType, string[]>>> => {
  const { db, organizationId } = ctx.var;
  const deleted: Partial<Record<ProductEntityType, string[]>> = {};
  if (hostIds.length === 0) return deleted;

  for (const relation of hierarchy.getHostRelations()) {
    if (relation.hostType !== hostType) continue;

    const table = entityTables[relation.hostedType as keyof typeof entityTables] as HostedTable;
    const hostIdColumn = (table as unknown as Record<string, PgColumn | undefined>)[relation.hostIdColumn];
    if (!hostIdColumn) {
      throw new Error(
        `[HostEntity] Hosted table for "${relation.hostedType}" is missing its host id column "${relation.hostIdColumn}"`,
      );
    }

    const rows = await db
      .update(table)
      .set({ deletedAt, deletedBy, updatedAt: deletedAt, updatedBy: deletedBy } as never)
      .where(and(inArray(hostIdColumn, hostIds), eq(table.organizationId, organizationId), isNull(table.deletedAt)))
      .returning({ id: table.id });

    deleted[relation.hostedType as ProductEntityType] = rows.map(({ id }) => id as string);
  }

  return deleted;
};
