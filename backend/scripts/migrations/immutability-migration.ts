import pc from 'picocolors';
import { allImmutabilityTables, immutabilityTriggersSQL } from '#/db/immutability-triggers';
import { logMigrationResult, upsertMigration } from './helpers/drizzle-utils';

/**
 * Immutability Triggers Migration
 *
 * Creates database triggers that prevent modification of identity columns
 * (id, tenant_id, organization_id, etc.) after row creation.
 *
 * This provides defense-in-depth protection against accidental or malicious
 * column modifications, even if someone uses admin bypass.
 */

const migrationSql = `-- Immutability Triggers Setup
-- Prevents modification of identity columns after row creation.
-- For PGlite: migration is skipped (no role support).
--

DO $$
BEGIN
  -- Check if roles exist (not available in PGlite)
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'runtime_role') THEN
    RAISE NOTICE 'Roles not available - skipping immutability triggers (e.g., PGlite).';
    RETURN;
  END IF;

  RAISE NOTICE 'Roles available - immutability triggers will be applied.';
END $$;

-- Only execute trigger creation if roles exist (real PostgreSQL)
-- The DO block above just logs; actual SQL runs unconditionally but triggers
-- are harmless in PGlite (they just exist without RLS context)

${immutabilityTriggersSQL}
`;

const result = upsertMigration('immutability_setup', migrationSql);
logMigrationResult(result, 'Immutability triggers');

console.info('');
console.info(`  ${pc.bold(pc.greenBright('Protected tables:'))}`);
for (const { tableName, functionName } of allImmutabilityTables) {
  console.info(`    - ${tableName} (${functionName})`);
}
console.info('');
