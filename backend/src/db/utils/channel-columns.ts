import { jsonb, varchar } from 'drizzle-orm/pg-core';
import type { ChannelEntityType } from 'shared';
import type { ToolsConfig } from 'shared/tools-config';
import { maxLength } from '#/db/utils/constraints';
import { channelPathColumn } from '#/db/utils/path-column';
import { publicColumn } from '#/db/utils/public-column';
import { channelPublishedColumn } from '#/db/utils/published-column';
import { tenantEntityColumns } from '#/db/utils/tenant-entity-columns';

/** The columns of every channel table: the tenant entity columns, slug, images, publication, `public`, tools and path. */
export const channelColumns = <T extends ChannelEntityType>(entityType: T) => ({
  ...tenantEntityColumns(entityType),
  slug: varchar({ length: maxLength.field }).unique().notNull(),
  thumbnailUrl: varchar({ length: maxLength.url }),
  bannerUrl: varchar({ length: maxLength.url }),
  ...channelPublishedColumn,
  ...publicColumn,
  /** Per-channel tool arrangement per placement slot. Stored sparse: a missing slot renders manifest defaults. */
  toolsConfig: jsonb().$type<ToolsConfig>().notNull().default({}),
  ...channelPathColumn(entityType),
});
