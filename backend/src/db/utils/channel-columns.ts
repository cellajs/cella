import { jsonb, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import type { ChannelEntityType } from 'shared';
import type { ToolsConfig } from 'shared/tools-config';
import { maxLength } from '#/db/utils/constraints';
import { channelPathColumn } from '#/db/utils/path-column';
import { tenantEntityColumns } from '#/db/utils/tenant-entity-columns';
import { usersTable } from '#/modules/user/user-db';

/**
 * Creates base columns shared by all channel entities.
 */
export const channelColumns = <T extends ChannelEntityType>(entityType: T) => ({
  ...tenantEntityColumns(entityType),
  slug: varchar({ length: maxLength.field }).unique().notNull(),
  thumbnailUrl: varchar({ length: maxLength.url }),
  bannerUrl: varchar({ length: maxLength.url }),
  createdBy: uuid().references(() => usersTable.id, { onDelete: 'set null' }),
  updatedBy: uuid().references(() => usersTable.id, { onDelete: 'set null' }),
  /**
   * Member-visible publication time; null defers invite dispatch for a draft context.
   * It defaults to creation, while product publication is opt-in and `publicAt` grants
   * non-member access.
   */
  publishedAt: timestamp({ mode: 'string' }).defaultNow(),
  /**
   * Public readability: non-null = readable by ANY actor, anonymous included, regardless of
   * membership. Only has effect when the entity declares `publicRead()` in
   * `shared/config/permissions-config.ts`; null (the default) keeps the mechanism dormant.
   */
  publicAt: timestamp('public_at', { mode: 'string' }),
  /**
   * Per-channel tool arrangement per placement slot (order/hidden/settings, tool ids only).
   * Stored sparse: a missing slot renders manifest defaults, so new tools need no backfill.
   * The placement/settings/tabs machinery is generic over channel types; the column lives here
   * so every channel table carries it without hand-copying.
   */
  toolsConfig: jsonb().$type<ToolsConfig>().notNull().default({}),
  ...channelPathColumn(entityType),
});
