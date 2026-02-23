import pc from 'picocolors';
import { allImmutabilityTables } from '#/db/immutability-triggers';
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

// Split the immutability SQL into functions and triggers
// Functions are safe to create top-level; triggers need role-gated exception handling
import {
  baseEntityImmutabilityFunctionSQL,
  productEntityImmutabilityFunctionSQL,
  membershipImmutabilityFunctionSQL,
  inactiveMembershipImmutabilityFunctionSQL,
} from '#/db/immutability-triggers';

const functionsSql = [
  baseEntityImmutabilityFunctionSQL,
  productEntityImmutabilityFunctionSQL,
  membershipImmutabilityFunctionSQL,
  inactiveMembershipImmutabilityFunctionSQL,
].join('\n');

const triggersSql = allImmutabilityTables.map(({ tableName, functionName }) => {
  const triggerName = `${tableName}_immutable_keys_trigger`;
  return `    EXECUTE 'DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName}';
    EXECUTE 'CREATE TRIGGER ${triggerName} BEFORE UPDATE ON ${tableName} FOR EACH ROW EXECUTE FUNCTION ${functionName}()';`;
}).join('\n');

const migrationSql = `-- Immutability Triggers Setup
-- Prevents modification of identity columns after row creation.
-- For PGlite: migration is skipped (no role support).

-- Functions are always created (harmless without triggers)
${functionsSql}
--> statement-breakpoint

-- Triggers require roles to exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'runtime_role') THEN
    RAISE NOTICE 'Roles not available - skipping immutability triggers (e.g., PGlite).';
    RETURN;
  END IF;

  BEGIN
${triggersSql}

    RAISE NOTICE 'Immutability triggers setup complete.';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Immutability triggers setup failed: %. Skipping.', SQLERRM;
  END;
END $$;
`;

const result = upsertMigration('immutability_setup', migrationSql);
logMigrationResult(result, 'Immutability triggers');

console.info('');
console.info(`  ${pc.bold(pc.greenBright('Protected tables:'))}`);
for (const { tableName, functionName } of allImmutabilityTables) {
  console.info(`    - ${tableName} (${functionName})`);
}
console.info('');
