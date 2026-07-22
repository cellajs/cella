import {
  allAdminOnlyWriteTables,
  allImmutabilityFunctionsSQL,
  allImmutabilityTables,
  adminOnlyWriteTriggerName,
  immutableKeysTriggerName,
} from '#/db/immutability-triggers';
import type { SideEffectBlock, SideEffectProducer } from '../types';

/**
 * Creates identity-immutability and admin-only write triggers from the shared registry.
 * Keep functions and trigger names unified there: one missing function rolls back every trigger
 * in this exception-handled block while surfacing only a notice.
 */
async function run(): Promise<SideEffectBlock> {
  const functionsSql = allImmutabilityFunctionsSQL.join('\n--> statement-breakpoint\n');

  const immutableKeysTriggers = allImmutabilityTables.map(({ tableName, functionName }) => {
    const triggerName = immutableKeysTriggerName(tableName);
    return `    EXECUTE 'DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName}';
    EXECUTE 'CREATE TRIGGER ${triggerName} BEFORE UPDATE ON ${tableName} FOR EACH ROW EXECUTE FUNCTION ${functionName}()';`;
  });

  const adminOnlyWriteTriggers = allAdminOnlyWriteTables.map(({ tableName, functionName }) => {
    const triggerName = adminOnlyWriteTriggerName(tableName);
    return `    EXECUTE 'DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName}';
    EXECUTE 'CREATE TRIGGER ${triggerName} BEFORE INSERT OR UPDATE OR DELETE ON ${tableName} FOR EACH ROW EXECUTE FUNCTION ${functionName}()';`;
  });

  const triggersSql = [...immutableKeysTriggers, ...adminOnlyWriteTriggers].join('\n');

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
    title: 'Immutability triggers — identity columns, write guards',
    sql: migrationSql,
    notes: [
      `Protected tables: ${allImmutabilityTables.map((t) => t.tableName).join(', ')}`,
      `Admin-only writes: ${allAdminOnlyWriteTables.map((t) => t.tableName).join(', ')}`,
    ],
  };
}

export const sideEffect: SideEffectProducer = {
  name: 'Immutability',
  produce: run,
};
