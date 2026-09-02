import type { ChannelEntityType } from 'shared';
import type { ChannelTable } from '#/db/utils/channel-relation-columns';
import { organizationsTable } from '#/modules/organization/organization-db';

/**
 * Channel tables by type (pinned; apps list theirs). Product tables reference their non-root
 * ancestors through it: `channelRelationColumns` resolves `references` lazily, so this map is read
 * only when drizzle serializes a table, never at module load, and the getters keep import cycles
 * between a channel table and its products harmless. Listed here, not registered at runtime,
 * because drizzle-kit loads every `*-db.ts` in isolation and only sees this file's import graph.
 * `satisfies` makes a missing channel a compile error.
 */
export const channelTables = {
  organization: () => organizationsTable,
} satisfies Record<ChannelEntityType, () => ChannelTable>;
