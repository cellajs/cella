import { boolean, foreignKey, index, jsonb, snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenantSelectPolicy, writeThroughPolicies } from '#/db/rls-helpers';
import { channelRelationColumns } from '#/db/utils/channel-relation-columns';
import { maxLength } from '#/db/utils/constraints';
import { productColumns } from '#/db/utils/product-columns';
import type { AttachmentKeys } from '#/modules/attachment/attachment-schema';
import { organizationsTable } from '#/modules/organization/organization-db';

/** Each attachment belongs to exactly one tenant and organization: the RLS isolation boundary. */
export const attachmentsTable = snakeCase.table(
  'attachments',
  {
    ...productColumns('attachment'),
    // Storage placement only: bytes in the public S3 bucket, served from the CDN. Row
    // readability for non-members is the separate `publicAt` grant.
    publicBucket: boolean().notNull().default(false),
    bucketName: varchar({ length: maxLength.field }).notNull(),
    /** Upload batch grouping (multi-file uploads shown as one carousel), not ownership. */
    groupId: uuid(),
    filename: varchar({ length: maxLength.field }).notNull(),
    contentType: varchar({ length: maxLength.field }).notNull(),
    convertedContentType: varchar({ length: maxLength.field }),
    size: varchar({ length: maxLength.field }).notNull(),
    // Storage object keys per variant. `original` is always present; other variants appear only
    // once the upload pipeline generates them.
    keys: jsonb()
      .$type<AttachmentKeys>()
      .notNull()
      .default({} as AttachmentKeys),
    ...channelRelationColumns('attachment'),
  },
  (table) => [
    index('attachments_organization_id_index').on(table.organizationId),
    // Delta-sync reads filter organization_id plus a seq range and order by seq, so this
    // composite makes the SSE fan-out list reads an index range scan.
    index('attachments_organization_id_seq_index').on(table.organizationId, table.seq),
    index('attachments_tenant_id_index').on(table.tenantId),
    index('attachments_created_by_index').on(table.createdBy),
    index('attachments_updated_by_index').on(table.updatedBy),
    index('attachments_group_id_index').on(table.groupId),
    foreignKey({
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [organizationsTable.tenantId, organizationsTable.id],
    }).onDelete('cascade'),
    tenantSelectPolicy('attachments', table),
    ...writeThroughPolicies('attachments'),
  ],
);

export type AttachmentModel = typeof attachmentsTable.$inferSelect;
export type InsertAttachmentModel = typeof attachmentsTable.$inferInsert;
