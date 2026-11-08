import { eq, sql } from 'drizzle-orm';
import { generateId } from 'shared/utils/entity-id';
import { vi } from 'vitest';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { adminDb } from '../helpers';
import { cleanupEntityHierarchy, insertAttachmentIn, joinAttachmentHome, seedAttachmentHome } from '../hierarchy-helpers';
import type { TestTenant } from './helpers';

/** A BlockNote document of one paragraph, as the relay materializes it. */
export const paragraph = (text: string) =>
  JSON.stringify([{ id: generateId(), type: 'paragraph', props: {}, content: [{ type: 'text', text, styles: {} }], children: [] }]);

/**
 * An attachment in the tenant's organization, written by `createdBy` (the tenant's user by default), its creator and
 * `members` members of its home. Attachments sit under RLS, so the row is arranged and read back on the admin
 * connection: under runtime_role a check on the test's own connection would pass vacuously.
 */
export async function seedAttachment(
  { tenantId, organization, user }: TestTenant,
  { description, createdBy = user.id, members = [] }: { description: string; createdBy?: string; members?: string[] },
) {
  const id = generateId();
  const org = { id: organization.id, tenantId };
  const plan = await seedAttachmentHome(org, createdBy);
  for (const userId of new Set([createdBy, ...members])) await joinAttachmentHome(org, plan, userId);
  await insertAttachmentIn(plan, { id, tenantId, description, createdBy });

  const read = async () => {
    const [stored] = await adminDb
      .select({ description: attachmentsTable.description, updatedBy: attachmentsTable.updatedBy })
      .from(attachmentsTable)
      .where(eq(attachmentsTable.id, id));
    return stored ?? null;
  };

  return {
    id,
    /** The stored row's description and last writer, or null once the row is gone. */
    read,
    remove: async () => {
      await adminDb.delete(attachmentsTable).where(eq(attachmentsTable.id, id));
      await cleanupEntityHierarchy(adminDb, plan);
    },
  };
}

/** A transaction holding the attachment row FOR UPDATE until released, as a write in flight holds it. */
export async function holdAttachmentRow(id: string) {
  const held = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  const done = adminDb.transaction(async (tx) => {
    await tx.select({ id: attachmentsTable.id }).from(attachmentsTable).where(eq(attachmentsTable.id, id)).for('update');
    held.resolve();
    await released.promise;
  });
  await Promise.race([held.promise, done]);
  return { release: () => released.resolve(), done };
}

/** Resolves once `count` sessions on the worker's database wait for a lock: requests queued behind a held row. */
export const lockWaiters = (count: number) =>
  vi.waitUntil(
    async () => {
      const { rows } = await adminDb.execute<{ waiting: number }>(
        sql`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      );
      return rows[0].waiting >= count;
    },
    { timeout: 5000, interval: 10 },
  );
