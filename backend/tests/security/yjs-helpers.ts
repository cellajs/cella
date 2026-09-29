import { eq } from 'drizzle-orm';
import { generateId } from 'shared/utils/entity-id';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { adminDb } from '../helpers';
import { cleanupEntityHierarchy, insertAttachmentRow, seedAttachmentHome } from '../hierarchy-helpers';

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
  const id = generateId();
  const plan = await seedAttachmentHome({ id: opts.organizationId, tenantId: opts.tenantId }, opts.createdBy);
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
  await insertAttachmentRow(row);

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
