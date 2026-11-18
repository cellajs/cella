import { jsonb, snakeCase, uuid } from 'drizzle-orm/pg-core';
import { auditColumns, writerColumn } from '#/db/utils/audit-columns';
import type { ServiceAccountId } from '#/db/utils/ids';
import { isoTimestamp } from '#/db/utils/timestamp-columns';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';

/** The personal fields an admin may release to an LTI tool in a launch. */
export const ltiReleasableFields = ['name', 'email', 'picture'] as const;

export type LtiReleasableField = (typeof ltiReleasableFields)[number];

/**
 * What an LTI tool's installation holds beside its service account: the personal fields its launches may carry and
 * the admin's approval. The account's status decides whether the installation may act. An auth table outside RLS,
 * like the service account it extends.
 */
export const ltiInstallationsTable = snakeCase.table('lti_installations', {
  serviceAccountId: uuid()
    .primaryKey()
    .references(() => serviceAccountsTable.id, { onDelete: 'cascade' })
    .$type<ServiceAccountId>(),
  /** Empty until an approval releases some; never more than the LTI tool asked for. */
  releasedFields: jsonb().$type<LtiReleasableField[]>().notNull().default([]),
  approvedAt: isoTimestamp(),
  approvedBy: writerColumn(),
  ...auditColumns(),
});

export type LtiInstallationModel = typeof ltiInstallationsTable.$inferSelect;
