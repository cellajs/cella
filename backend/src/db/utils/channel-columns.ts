import { boolean, jsonb, varchar } from 'drizzle-orm/pg-core';
import type { ChannelEntityType } from 'shared';
import { channelCodeLength } from 'shared/share-link';
import type { ToolsConfig } from 'shared/tools-config';
import { maxLength } from '#/db/utils/constraints';
import { channelPathColumn } from '#/db/utils/path-column';
import { publicColumn } from '#/db/utils/public-column';
import { channelPublishedColumn } from '#/db/utils/published-column';
import { tenantEntityColumns } from '#/db/utils/tenant-entity-columns';

/** The columns of every channel table: the tenant entity columns, slug, share code, images, publication, `public`, archive state, tools and path. */
export const channelColumns = <T extends ChannelEntityType>(entityType: T) => ({
  ...tenantEntityColumns(entityType),
  slug: varchar({ length: maxLength.field }).unique().notNull(),
  /** Names the channel in share links; the insert trigger draws it from `channel_codes` and it never changes. */
  code: varchar({ length: channelCodeLength }).notNull().default(''),
  thumbnailUrl: varchar({ length: maxLength.url }),
  bannerUrl: varchar({ length: maxLength.url }),
  ...channelPublishedColumn,
  ...publicColumn,
  /** Closes the channel to writes. The organization's stays false: its tenant archives, and the archive route refuses it. */
  archived: boolean().notNull().default(false),
  /** Per-channel tool arrangement per placement slot. Stored sparse: a missing slot renders manifest defaults. */
  toolsConfig: jsonb().$type<ToolsConfig>().notNull().default({}),
  ...channelPathColumn(entityType),
});
