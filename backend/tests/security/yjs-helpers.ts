import { eq } from 'drizzle-orm';
import { buildTestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { getAdminDb } from '#/db/db';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { cleanupEntityHierarchy, seedEntityHierarchy } from '../hierarchy-helpers';

/** A BlockNote document of one paragraph, as the relay materializes it. */
export const paragraph = (text: string) =>
  JSON.stringify([
    { id: generateId(), type: 'paragraph', props: {}, content: [{ type: 'text', text, styles: {} }], children: [] },
  ]);

/**
 * An attachment in an organization. Attachments sit under RLS, so the row is arranged and read back on the admin
 * connection: under runtime_role a check on the test's own connection would pass vacuously.
 */
export async function seedAttachment(opts: {
  tenantId: string;
  organizationId: string;
  createdBy: string;
  description: string;
}) {
  const adminDb = getAdminDb('yjs security test');
  const id = generateId();
  const plan = buildTestEntityHierarchyPlan({
    entityType: 'attachment',
    organizationId: opts.organizationId,
    makeChannelId: () => generateId(),
  });
  await seedEntityHierarchy(adminDb, plan, {
    tenantId: opts.tenantId,
    createdBy: opts.createdBy,
    slugPrefix: `yjs-${id.slice(0, 8)}`,
  });
  const row = buildInsertableProduct(
    'attachment',
    {
      id,
      tenantId: opts.tenantId,
      ...plan.channelIdColumns,
      description: opts.description,
      createdBy: opts.createdBy,
      updatedBy: null,
      deletedBy: null,
    },
    id,
  );
  // buildInsertableProduct returns a config-derived Record, so the insert type needs a cast.
  await adminDb.insert(attachmentsTable).values(row as typeof attachmentsTable.$inferInsert);

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
