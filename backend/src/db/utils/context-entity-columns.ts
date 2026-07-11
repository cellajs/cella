import { timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import type { ContextEntityType } from 'shared';
import { maxLength } from '#/db/utils/constraints';
import { tenantEntityColumns } from '#/db/utils/tenant-entity-columns';
import { usersTable } from '#/modules/user/user-db';

/**
 * Creates base columns shared by all context entities.
 */
export const contextEntityColumns = <T extends ContextEntityType>(entityType: T) => ({
  ...tenantEntityColumns(entityType),
  slug: varchar({ length: maxLength.field }).unique().notNull(),
  thumbnailUrl: varchar({ length: maxLength.url }),
  bannerUrl: varchar({ length: maxLength.url }),
  createdBy: uuid().references(() => usersTable.id, { onDelete: 'set null' }),
  updatedBy: uuid().references(() => usersTable.id, { onDelete: 'set null' }),
  /**
   * When the context went live for its members: null = draft (invites against it are
   * deferred, see membership dispatch). Defaults to creation time, so forks without
   * draft flows never see null and the mechanism stays dormant. Distinct from
   * `publicAt` (public readability).
   */
  publishedAt: timestamp({ mode: 'string' }).defaultNow(),
});
