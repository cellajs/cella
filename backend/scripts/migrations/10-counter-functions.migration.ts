import { maxMergeKeySql } from '#/modules/entities/counter-keys';
import type { SideEffectBlock, SideEffectProducer } from '../types';

/**
 * PL/pgSQL function merging JSONB count deltas into channel_counters rows. Fixed-shape SQL
 * lets the CDC worker use prepared statements for counter upserts.
 *
 * Increments add up with no floor: a count below zero is a counting bug the verify finds.
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
    IF ${maxMergeKeySql('k')} THEN
      -- Activity stamps (epoch ms) and the organization's sequence frontiers:
      -- keep the max, the signal only moves forward
      result := result || jsonb_build_object(
        k, GREATEST(COALESCE((result->>k)::bigint, 0), v::bigint)
      );
    ELSE
      result := result || jsonb_build_object(
        k, COALESCE((result->>k)::bigint, 0) + v::bigint
      );
    END IF;
  END LOOP;
  RETURN result;
END;
$$;
`;

  return {
    tag: 'counter_functions',
    title: 'Counter functions, apply_count_deltas',
    sql: migrationSql,
    notes: ['Function: apply_count_deltas(existing jsonb, deltas jsonb) → jsonb'],
  };
}

export const sideEffect: SideEffectProducer = {
  name: 'Counters',
  produce: run,
};
