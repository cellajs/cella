import { timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import type { ChannelEntityType } from 'shared';
import { maxLength } from '#/db/utils/constraints';
import { tenantEntityColumns } from '#/db/utils/tenant-entity-columns';
import { usersTable } from '#/modules/user/user-db';

/**
 * Creates base columns shared by all channel entities.
 */
export const channelEntityColumns = <T extends ChannelEntityType>(entityType: T) => ({
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
   * `publicAt` below: `publishedAt` controls MEMBER visibility, `publicAt` grants NON-members.
   * The PRODUCT-entity sibling (`published-column.ts`, nullable, no default) carries
   * different semantics: null = author-only draft, enforced across dispatch, reads,
   * counters and cache (see `shared/src/published-rows.ts`).
   */
  publishedAt: timestamp({ mode: 'string' }).defaultNow(),
  /**
   * Public readability: non-null = readable by ANY actor, anonymous included, regardless of
   * membership. Only has effect when the entity declares `publicRead()` in
   * `shared/config/permissions-config.ts`; null (the default) keeps the mechanism dormant.
   */
  publicAt: timestamp('public_at', { mode: 'string' }),
});
