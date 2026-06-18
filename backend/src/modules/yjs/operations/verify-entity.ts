import { eq, sql } from 'drizzle-orm';
import type { EntityType } from 'shared';
import { baseDb } from '#/db/db';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { checkPermission } from '#/permissions';
import type { SubjectForPermission } from '#/permissions/permission-manager/types';

export async function verifyEntityOp(params: {
  entityType: string;
  entityId: string;
  tenantId: string;
  userId: string;
}) {
  const { entityType, entityId, tenantId, userId } = params;

  // Resolve entity + load user memberships in a single RLS-scoped transaction
  const result = await baseDb.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION READ ONLY`);
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);

    const [entity, memberships] = await Promise.all([
      resolveEntity({ var: { db: tx } }, entityType as EntityType, entityId),
      tx.select().from(membershipsTable).where(eq(membershipsTable.userId, userId)),
    ]);

    return { entity, memberships };
  });

  if (!result.entity) return { allowed: false };

  // Defense-in-depth: verify tenant match even if RLS is not enforced (e.g. superuser connection)
  if ('tenantId' in result.entity && result.entity.tenantId !== tenantId) {
    return { allowed: false };
  }

  // Check actual update permission — this evaluates the full ancestor chain (project → organization)
  const subject = result.entity as SubjectForPermission;
  const { isAllowed } = checkPermission(result.memberships, 'update', subject);

  return { allowed: isAllowed };
}
