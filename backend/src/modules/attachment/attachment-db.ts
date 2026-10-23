import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenantSelectPolicy, writeThroughPolicies } from '#/db/rls-helpers';
import { channelRelationColumns, channelRelationIndexes } from '#/db/utils/channel-relation-columns';
import { maxLength } from '#/db/utils/constraints';
import { organizationForeignKey } from '#/db/utils/organization-foreign-key';
import { productColumns, productIndexes } from '#/db/utils/product-columns';
import { isoTimestamp } from '#/db/utils/timestamp-columns';
import type { AttachmentKeys } from '#/modules/attachment/attachment-schema';

/** Each attachment belongs to exactly one tenant and organization: the RLS isolation boundary. */
export const attachmentsTable = snakeCase.table(
  'attachments',
  {
    ...productColumns('attachment'),
    // Storage placement only: bytes in the public S3 bucket, served from the CDN. Row
    // readability for non-members is the separate `public` flag.
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
    /** When the file purge removed a deleted attachment's stored files; set by the job, not an actor, so `updatedAt` stays. */
    purgedAt: isoTimestamp(),
    ...channelRelationColumns('attachment'),
  },
  (table) => [
    ...productIndexes('attachments', table),
    // The list's default order, read backward: `.desc()` would emit NULLS LAST, which an `ORDER BY ... DESC` cannot use.
    index('attachments_organization_id_created_at_index').on(table.organizationId, table.createdAt, table.id),
    index('attachments_group_id_index').on(table.groupId),
    // The file purge's queue: deleted rows whose files remain.
    index('attachments_purge_pending_index').on(table.deletedAt).where(sql`${table.deletedAt} is not null and ${table.purgedAt} is null`),
    // An index per sub-organization ancestor column; none for org-homed rows.
    ...channelRelationIndexes('attachments', table, 'attachment'),
    organizationForeignKey(table),
    tenantSelectPolicy('attachments', table),
    ...writeThroughPolicies('attachments'),
  ],
);

export type AttachmentModel = typeof attachmentsTable.$inferSelect;
export type InsertAttachmentModel = typeof attachmentsTable.$inferInsert;
