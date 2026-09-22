import { jsonb, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import type { ChannelEntityType } from 'shared';
import type { ToolsConfig } from 'shared/tools-config';
import { maxLength } from '#/db/utils/constraints';
import type { PrincipalId } from '#/db/utils/ids';
import { channelPathColumn } from '#/db/utils/path-column';
import { tenantEntityColumns } from '#/db/utils/tenant-entity-columns';
import { principalsTable } from '#/modules/principals/principals-db';

export const channelColumns = <T extends ChannelEntityType>(entityType: T) => ({
  ...tenantEntityColumns(entityType),
  slug: varchar({ length: maxLength.field }).unique().notNull(),
  thumbnailUrl: varchar({ length: maxLength.url }),
  bannerUrl: varchar({ length: maxLength.url }),
  createdBy: uuid()
    .references(() => principalsTable.id, { onDelete: 'set null' })
    .$type<PrincipalId>(),
  updatedBy: uuid()
    .references(() => principalsTable.id, { onDelete: 'set null' })
    .$type<PrincipalId>(),
  /** Member-visible publication time, defaulting to creation; null defers invite dispatch for a draft context. */
  publishedAt: timestamp({ mode: 'string' }).defaultNow(),
  /** Non-null: readable by any actor including anonymous. Only applies when the entity declares `publicRead()`. */
  publicAt: timestamp('public_at', { mode: 'string' }),
  /** Per-channel tool arrangement per placement slot. Stored sparse: a missing slot renders manifest defaults. */
  toolsConfig: jsonb().$type<ToolsConfig>().notNull().default({}),
  ...channelPathColumn(entityType),
});
