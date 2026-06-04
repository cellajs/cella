import pc from 'picocolors';
import { logMigrationResult, upsertMigration } from './helpers/drizzle-utils';
import type { GenerateScript } from '../types';

/**
 * Counter Functions Migration
 *
 * Creates a PL/pgSQL function for merging JSONB count deltas into
 * context_counters rows. This enables fixed-shape SQL for counter
 * upserts, which can then use prepared statements in the CDC worker.
 *
 * The function iterates over keys in a deltas JSONB object and applies
 * each increment with a floor of 0 to prevent negative counters.
 */
async function run() {
  const migrationSql = `-- Counter Functions Setup
-- PL/pgSQL helper for JSONB counter delta merging.
-- Used by the CDC worker for prepared-statement-compatible counter upserts.

CREATE OR REPLACE FUNCTION apply_count_deltas(existing jsonb, deltas jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE
AS $$
DECLARE
  result jsonb := COALESCE(existing, '{}'::jsonb);
  k text;
  v text;
BEGIN
  FOR k, v IN SELECT * FROM jsonb_each_text(deltas)
  LOOP
    result := result || jsonb_build_object(
      k, GREATEST(0, COALESCE((result->>k)::bigint, 0) + v::bigint)
    );
  END LOOP;
  RETURN result;
END;
$$;
`;

  const result = upsertMigration('counter_functions', migrationSql);
  logMigrationResult(result, 'Counter functions');

  console.info('');
  console.info(`  ${pc.bold(pc.greenBright('Function:'))} apply_count_deltas(existing jsonb, deltas jsonb) → jsonb`);
  console.info('');
}

export const generateConfig: GenerateScript = {
  name: 'Counters',
  type: 'migration',
  run,
};
