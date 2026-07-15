import pc from 'picocolors';
import { logMigrationResult, upsertMigration } from './helpers/drizzle-utils';
import type { GenerateScript } from '../types';

/**
 * PL/pgSQL function merging JSONB count deltas into channel_counters rows. Fixed-shape SQL
 * lets the CDC worker use prepared statements for counter upserts.
 *
 * Increments apply with a floor of 0 (no negative counters). `li:` (last insert) / `lu:`
 * (last update) keys are epoch-ms activity stamps, not deltas: they merge via GREATEST so
 * the signal only moves forward.
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
    IF k LIKE 'li:%' OR k LIKE 'lu:%' THEN
      -- Activity stamps (epoch ms): keep the max, the signal only moves forward
      result := result || jsonb_build_object(
        k, GREATEST(COALESCE((result->>k)::bigint, 0), v::bigint)
      );
    ELSE
      result := result || jsonb_build_object(
        k, GREATEST(0, COALESCE((result->>k)::bigint, 0) + v::bigint)
      );
    END IF;
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
