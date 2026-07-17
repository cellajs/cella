import { getTableName } from 'drizzle-orm';
import { allImmutabilityTables } from '#/db/immutability-triggers';
import { entityTables, resourceTables } from '#/tables';
import { CDC_PUBLICATION_NAME } from '../../../cdc/src/constants';
import type { SideEffectBlock, SideEffectProducer } from '../types';
import { partitionConfigs } from './10-partman.migration';
import { classifyRlsTables } from './10-rls.migration';
import { unloggedTables } from './10-unlogged.migration';

/**
 * Verification block — always the LAST block in the combined side-effect migration
 * (99- filename prefix), asserting that the earlier blocks achieved their end state.
 *
 * Why this exists: every side-effect block runs inside its own guards, and a failure
 * that slips through (or a block that silently rolls back) previously shipped databases
 * where triggers or partitioning were simply absent while the migration reported success.
 * Because the migrator applies everything in one transaction, a failed assertion here
 * rolls back the ENTIRE migration and surfaces the real problem at migrate time.
 *
 * Each assertion honors the same precondition as the block it verifies (roles present,
 * pg_partman installed), so environments that legitimately skip a feature still pass.
 * The SQL is generated from the same TS sources as the producers, so the assertions
 * evolve in lockstep with the blocks they check.
 */
async function run(): Promise<SideEffectBlock> {
  const { rlsTables, fullCrudTables, readOnlyTables } = classifyRlsTables();
  const grantTables = [...rlsTables, ...fullCrudTables, ...readOnlyTables];
  const functionNames = [...new Set(allImmutabilityTables.map((t) => t.functionName)), 'apply_count_deltas'];
  const publicationTableCount = [...Object.values(entityTables), ...Object.values(resourceTables)].map(getTableName).length;

  const triggerChecks = allImmutabilityTables
    .map(
      ({ tableName }) => `  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relnamespace = 'public'::regnamespace AND c.relname = '${tableName}'
      AND t.tgname = '${tableName}_immutable_keys_trigger' AND NOT t.tgisinternal
  ) THEN missing := array_append(missing, 'trigger:${tableName}_immutable_keys_trigger'); END IF;`,
    )
    .join('\n');

  const functionChecks = functionNames
    .map(
      (fn) => `  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = '${fn}') THEN
    missing := array_append(missing, 'function:${fn}'); END IF;`,
    )
    .join('\n');

  const partitionChecks = partitionConfigs
    .map(
      ({ name }) => `    IF NOT EXISTS (
      SELECT 1 FROM pg_partitioned_table pt JOIN pg_class c ON c.oid = pt.partrelid
      WHERE c.relname = '${name}' AND c.relnamespace = 'public'::regnamespace
    ) THEN missing := array_append(missing, 'partitioned:${name}'); END IF;`,
    )
    .join('\n');

  const forceRlsChecks = rlsTables
    .map(
      (t) => `    IF NOT EXISTS (
      SELECT 1 FROM pg_class WHERE relname = '${t}' AND relnamespace = 'public'::regnamespace
        AND relrowsecurity AND relforcerowsecurity
    ) THEN missing := array_append(missing, 'force-rls:${t}'); END IF;`,
    )
    .join('\n');

  const grantChecks = grantTables
    .map(
      (t) => `    IF NOT has_table_privilege('runtime_role', 'public.${t}', 'SELECT') THEN
      missing := array_append(missing, 'grant:${t}'); END IF;`,
    )
    .join('\n');

  const unloggedChecks = unloggedTables
    .map(
      (t) => `    IF (SELECT relpersistence FROM pg_class WHERE relname = '${t}' AND relnamespace = 'public'::regnamespace) IS DISTINCT FROM 'u' THEN
      missing := array_append(missing, 'unlogged:${t}'); END IF;`,
    )
    .join('\n');

  const migrationSql = `-- Side-effect verification
-- Asserts the end state of every previous block. A failed assertion aborts (and rolls
-- back) the whole migration instead of shipping a silently degraded database.

DO $$
DECLARE
  missing text[] := '{}';
BEGIN
  -- Functions (created unconditionally by their blocks)
${functionChecks}

  -- Immutability triggers + RLS + grants + UNLOGGED (same precondition as their blocks: roles exist)
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'runtime_role') THEN
${triggerChecks
  .split('\n')
  .map((l) => `  ${l}`)
  .join('\n')}

${forceRlsChecks}

${grantChecks}

${unloggedChecks}
  ELSE
    RAISE NOTICE 'verify: roles not available - skipping trigger/RLS/grant/unlogged assertions.';
  END IF;

  -- Partitioning (same precondition as the partman block: extension installed)
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_partman') THEN
${partitionChecks}
  ELSE
    RAISE NOTICE 'verify: pg_partman not installed - skipping partition assertions.';
  END IF;

  -- CDC publication (${publicationTableCount} tracked tables)
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = '${CDC_PUBLICATION_NAME}') THEN
    missing := array_append(missing, 'publication:${CDC_PUBLICATION_NAME}');
  ELSIF (SELECT count(DISTINCT tablename) FROM pg_publication_tables WHERE pubname = '${CDC_PUBLICATION_NAME}') <> ${publicationTableCount} THEN
    missing := array_append(missing, 'publication-tables:${CDC_PUBLICATION_NAME}');
  END IF;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'DB side-effect verification failed — missing: %', array_to_string(missing, ', ');
  END IF;

  RAISE NOTICE 'Side-effect verification passed.';
END $$;
`;

  return {
    tag: 'verify_side_effects',
    title: 'Verify — assert end state of all side-effect blocks',
    sql: migrationSql,
    notes: [
      `asserts: ${allImmutabilityTables.length} triggers, ${functionNames.length} functions, ${partitionConfigs.length} partitioned tables, ${rlsTables.length} FORCE-RLS tables, ${grantTables.length} grants, ${unloggedTables.length} unlogged, 1 publication`,
    ],
  };
}

export const sideEffect: SideEffectProducer = {
  name: 'Verify',
  produce: run,
};
