import { getTableName } from 'drizzle-orm';
import pc from 'picocolors';
import { entityTables } from '#/table-config';
import { inactiveMembershipsTable } from '#/db/schema/inactive-memberships';
import { membershipsTable } from '#/db/schema/memberships';
import { logMigrationResult, upsertMigration } from './helpers/drizzle-utils';

// ============================================================================
// Table Classification
// ============================================================================

/**
 * Collect all entity tables that need RLS setup (ownership, FORCE RLS, grants).
 * Policies are defined in Drizzle schema files using pgPolicy() - not generated here.
 */
const entityTableNames = Object.entries(entityTables)
  .filter(([entityType]) => entityType !== 'user')
  .map(([, table]) => getTableName(table));

const membershipTables = [getTableName(membershipsTable), getTableName(inactiveMembershipsTable)];
const rlsTables = [...entityTableNames, ...membershipTables];

// Tables without RLS but needing grants (auth, system, etc.)
const fullCrudTables = [
  'users',
  'sessions',
  'last_seen',
  'tokens',
  'passkeys',
  'oauth_accounts',
  'passwords',
  'totps',
  'requests',
  'unsubscribe_tokens',
  'emails',
  'rate_limits',
  'counters',
  'context_counters',
];
const readOnlyTables = ['tenants', 'system_roles', 'activities'];

// ============================================================================
// Migration SQL
// ============================================================================

const migrationSql = `-- RLS (Row-Level Security) Setup
-- Configures FORCE RLS, table ownership, and grants.
-- Policies are defined in Drizzle schema files using pgPolicy().
-- For PGlite: migration is skipped (no role support).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'runtime_role') THEN
    RAISE NOTICE 'Roles not available - skipping RLS setup (e.g., PGlite).';
    RETURN;
  END IF;

  -- Table ownership and FORCE RLS
${rlsTables.map((t) => `  ALTER TABLE ${t} OWNER TO admin_role;`).join('\n')}
  ALTER TABLE activities OWNER TO admin_role;

${rlsTables.map((t) => `  ALTER TABLE ${t} FORCE ROW LEVEL SECURITY;`).join('\n')}

  -- Grants: runtime_role (subject to RLS)
${rlsTables.map((t) => `  GRANT SELECT, INSERT, UPDATE, DELETE ON ${t} TO runtime_role;`).join('\n')}
${fullCrudTables.map((t) => `  GRANT SELECT, INSERT, UPDATE, DELETE ON ${t} TO runtime_role;`).join('\n')}
${readOnlyTables.map((t) => `  GRANT SELECT ON ${t} TO runtime_role;`).join('\n')}

  -- Grants: cdc_role (append-only activities + counter sequences)
  GRANT INSERT ON activities TO cdc_role;
  GRANT SELECT, INSERT, UPDATE ON counters TO cdc_role;
  GRANT SELECT, INSERT, UPDATE ON context_counters TO cdc_role;
  GRANT SELECT ON tenants TO cdc_role;
  GRANT SELECT ON organizations TO cdc_role;

  -- Grants: admin_role (full access)
  GRANT ALL ON ALL TABLES IN SCHEMA public TO admin_role;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO admin_role;

  -- Grants: pg_catalog usage for JSONB operators
  GRANT USAGE ON SCHEMA pg_catalog TO runtime_role;

  RAISE NOTICE 'RLS setup complete.';
END $$;
`;

// ============================================================================
// Execute Migration
// ============================================================================

const result = upsertMigration('rls_setup', migrationSql);
logMigrationResult(result, 'RLS setup');

console.info('');
console.info(`  ${pc.cyanBright('RLS tables:')} ${rlsTables.join(', ')}`);
console.info(`  ${pc.dim('(Policies defined in Drizzle schema via pgPolicy())')}`);
