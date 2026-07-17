import type { SideEffectBlock, SideEffectProducer } from '../types';

/** Regenerable tables converted to UNLOGGED; shared with the verification block. */
export const unloggedTables = ['rate_limits', 'user_counters', 'channel_counters', 'product_counters'];

async function run(): Promise<SideEffectBlock> {
  const alterStatements = unloggedTables
    .map(
      (t) => `  IF (SELECT relpersistence FROM pg_class WHERE relname = '${t}') != 'u' THEN
    ALTER TABLE ${t} SET UNLOGGED;
    RAISE NOTICE '${t} set to UNLOGGED';
  END IF;`,
    )
    .join('\n\n');

  const migrationSql = `-- UNLOGGED Tables Setup
-- Converts ephemeral counter/rate-limit tables to UNLOGGED (skip WAL writes).
-- Idempotent: only alters tables not already UNLOGGED.
-- Gracefully skips if required roles are not yet created.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'runtime_role') THEN
    RAISE NOTICE 'Skipping UNLOGGED setup - roles not available.';
    RETURN;
  END IF;

${alterStatements}

  RAISE NOTICE 'UNLOGGED setup complete.';
END $$;
`;

  return {
    tag: 'unlogged_setup',
    title: 'UNLOGGED tables',
    sql: migrationSql,
    notes: [`UNLOGGED tables: ${unloggedTables.join(', ')}`],
  };
}

export const sideEffect: SideEffectProducer = {
  name: 'UNLOGGED',
  produce: run,
};
