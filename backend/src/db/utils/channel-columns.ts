import { jsonb, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import type { ChannelEntityType } from 'shared';
import type { ToolsConfig } from 'shared/tools-config';
import { maxLength } from '#/db/utils/constraints';
import type { ActorId } from '#/db/utils/ids';
import { channelPathColumn } from '#/db/utils/path-column';
import { tenantEntityColumns } from '#/db/utils/tenant-entity-columns';
import { actorsTable } from '#/modules/actors/actors-db';

export const channelColumns = <T extends ChannelEntityType>(entityType: T) => ({
  ...tenantEntityColumns(entityType),
  slug: varchar({ length: maxLength.field }).unique().notNull(),
  thumbnailUrl: varchar({ length: maxLength.url }),
  bannerUrl: varchar({ length: maxLength.url }),
  createdBy: uuid()
    .references(() => actorsTable.id, { onDelete: 'set null' })
    .$type<ActorId>(),
  updatedBy: uuid()
    .references(() => actorsTable.id, { onDelete: 'set null' })
    .$type<ActorId>(),
  /** Member-visible publication time, defaulting to creation; null defers invite dispatch for a draft context. */
  publishedAt: timestamp({ mode: 'string' }).defaultNow(),
  /** Non-null: readable by any actor including anonymous. Only applies when the entity declares `publicRead()`. */
  publicAt: timestamp('public_at', { mode: 'string' }),
  /** Per-channel tool arrangement per placement slot. Stored sparse: a missing slot renders manifest defaults. */
  toolsConfig: jsonb().$type<ToolsConfig>().notNull().default({}),
  ...channelPathColumn(entityType),
});
