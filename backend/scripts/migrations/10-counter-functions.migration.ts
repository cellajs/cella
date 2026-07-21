import type { SideEffectBlock, SideEffectProducer } from '../types';

/**
 * PL/pgSQL function merging JSONB count deltas into channel_counters rows. Fixed-shape SQL
 * lets the CDC worker use prepared statements for counter upserts.
 *
 * Increments apply with a floor of 0 (no negative counters). `e:li:` (last insert) / `e:lu:`
 * (last update) keys are epoch-ms activity stamps and `e:f:` keys are org-sequence
 * frontiers (subtree `e:f:` and self `e:f:h:`), not deltas: they merge via GREATEST so the
 * signal only moves forward.
 */
async function run(): Promise<SideEffectBlock> {
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
    IF k LIKE 'e:li:%' OR k LIKE 'e:lu:%' OR k LIKE 'e:f:%' THEN
      -- Activity stamps (epoch ms) and sequence frontiers (e:f: covers subtree
      -- and self e:f:h:): keep the max, the signal only moves forward
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

  return {
    tag: 'counter_functions',
    title: 'Counter functions — apply_count_deltas',
    sql: migrationSql,
    notes: ['Function: apply_count_deltas(existing jsonb, deltas jsonb) → jsonb'],
  };
}

export const sideEffect: SideEffectProducer = {
  name: 'Counters',
  produce: run,
};
