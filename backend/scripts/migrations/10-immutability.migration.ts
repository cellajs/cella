import { allImmutabilityTables } from '#/db/immutability-triggers';
import {
  appendOnlyImmutabilityFunctionSQL,
  baseEntityImmutabilityFunctionSQL,
  productEntityImmutabilityFunctionSQL,
  membershipImmutabilityFunctionSQL,
  inactiveMembershipImmutabilityFunctionSQL,
} from '#/db/immutability-triggers';
import type { SideEffectBlock, SideEffectProducer } from '../types';

/**
 * Creates triggers that prevent modification of identity columns (id, tenant_id,
 * organization_id, etc.) after row creation — defense-in-depth that holds even under
 * admin bypass.
 */
async function run(): Promise<SideEffectBlock> {
  const functionsSql = [
    baseEntityImmutabilityFunctionSQL,
    productEntityImmutabilityFunctionSQL,
    membershipImmutabilityFunctionSQL,
    inactiveMembershipImmutabilityFunctionSQL,
    appendOnlyImmutabilityFunctionSQL,
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
    -- Fail LOUDLY: a swallowed failure here rolls back EVERY trigger in this block and
    -- ships a database where identity columns (tenant_id, organization_id, ...) are
    -- mutable — the write-through RLS policies delegate that protection to these triggers.
    RAISE EXCEPTION 'Immutability triggers setup failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
  END;
END $$;
`;

  return {
    tag: 'immutability_setup',
    title: 'Immutability triggers — identity columns',
    sql: migrationSql,
    notes: [`Protected tables: ${allImmutabilityTables.map((t) => t.tableName).join(', ')}`],
  };
}

export const sideEffect: SideEffectProducer = {
  name: 'Immutability',
  produce: run,
};
