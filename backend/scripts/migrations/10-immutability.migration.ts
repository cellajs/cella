import pc from 'picocolors';
import { logMigrationResult, upsertMigration } from './helpers/drizzle-utils';
import { allImmutabilityTables } from '#/db/immutability-triggers';
import {
  baseEntityImmutabilityFunctionSQL,
  productEntityImmutabilityFunctionSQL,
  membershipImmutabilityFunctionSQL,
  inactiveMembershipImmutabilityFunctionSQL,
} from '#/db/immutability-triggers';
import type { GenerateScript } from '../types';

/**
 * Creates triggers that prevent modification of identity columns (id, tenant_id,
 * organization_id, etc.) after row creation — defense-in-depth that holds even under
 * admin bypass.
 */
async function run() {
  const functionsSql = [
    baseEntityImmutabilityFunctionSQL,
    productEntityImmutabilityFunctionSQL,
    membershipImmutabilityFunctionSQL,
    inactiveMembershipImmutabilityFunctionSQL,
  ].join('\n--> statement-breakpoint\n');

  const triggersSql = allImmutabilityTables.map(({ tableName, functionName }) => {
    const triggerName = `${tableName}_immutable_keys_trigger`;
    return `    EXECUTE 'DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName}';
    EXECUTE 'CREATE TRIGGER ${triggerName} BEFORE UPDATE ON ${tableName} FOR EACH ROW EXECUTE FUNCTION ${functionName}()';`;
  }).join('\n');

  const migrationSql = `-- Immutability Triggers Setup
-- Prevents modification of identity columns after row creation.
-- Gracefully skips triggers if required roles are not yet created.

-- Functions are always created (harmless without triggers)
${functionsSql}
--> statement-breakpoint

-- Triggers require roles to exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'runtime_role') THEN
    RAISE NOTICE 'Roles not available - skipping immutability triggers.';
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
}

export const generateConfig: GenerateScript = {
  name: 'Immutability',
  type: 'migration',
  run,
};
