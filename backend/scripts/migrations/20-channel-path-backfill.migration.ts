import { channelPathSyncStatements } from '#/modules/entities/helpers/recalculate-counters';
import type { SideEffectBlock, SideEffectProducer } from '../types';

/**
 * Counters rows written before CDC kept channel paths hold none, so catchup proves only such a node's id and org-wide
 * readers get no frontiers for it. This copies every channel's canonical path onto its counters row, as the counters
 * recalculation does. Idempotent: it touches only rows whose path differs.
 */
async function run(): Promise<SideEffectBlock> {
  const statements = channelPathSyncStatements();
  const migrationSql = `-- Channel path backfill
-- Copies each channel's canonical path onto its channel_counters row.

${statements.join(';\n--> statement-breakpoint\n\n')};
`;

  return {
    tag: 'channel_path_backfill',
    title: 'Channel path backfill, canonical paths on counters rows',
    sql: migrationSql,
    notes: [`Channel tables: ${statements.length}`],
  };
}

export const sideEffect: SideEffectProducer = {
  name: 'Channel path backfill',
  produce: run,
};
