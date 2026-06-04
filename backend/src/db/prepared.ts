/**
 * Prepared statements for high-frequency queries.
 *
 * These avoid PostgreSQL re-parsing and re-planning on every execution.
 * Only suitable for queries with a fixed shape that always run on baseDb
 * (not inside transactions).
 *
 * Skipped when DEV_MODE='none' (e.g. OpenAPI generation) where baseDb is a stub.
 */

import { eq, sql } from 'drizzle-orm';
import { baseDb } from './db';
import { activitiesTable } from './schema/activities';
import { tenantsTable } from './schema/tenants';

const hasDb = typeof baseDb.select === 'function';

// ── Tenant guard ─────────────────────────────────────────────────────────────

export const findTenantById = hasDb
  ? baseDb
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, sql.placeholder('id')))
      .limit(1)
      .prepare('find_tenant_by_id')
  : (undefined as never);

// ── Idempotency (sync engine) ────────────────────────────────────────────────

export const findActivityByMutationId = hasDb
  ? baseDb
      .select({ id: activitiesTable.id })
      .from(activitiesTable)
      .where(sql`${activitiesTable.stx}->>'mutationId' = ${sql.placeholder('mutationId')}`)
      .limit(1)
      .prepare('find_activity_by_mutation_id')
  : (undefined as never);

export const findActivityRefByMutationId = hasDb
  ? baseDb
      .select({
        entityType: activitiesTable.entityType,
        subjectId: activitiesTable.subjectId,
      })
      .from(activitiesTable)
      .where(sql`${activitiesTable.stx}->>'mutationId' = ${sql.placeholder('mutationId')}`)
      .limit(1)
      .prepare('find_activity_ref_by_mutation_id')
  : (undefined as never);
