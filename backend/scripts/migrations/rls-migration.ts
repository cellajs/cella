import { getTableName } from 'drizzle-orm';
import pc from 'picocolors';
import { hierarchy } from 'shared';
import { entityTables } from '#/table-config';
import { inactiveMembershipsTable } from '#/db/schema/inactive-memberships';
import { membershipsTable } from '#/db/schema/memberships';
import { logMigrationResult, upsertMigration } from './helpers/drizzle-utils';

// ============================================================================
// Table Classification
// ============================================================================

/**
 * Partition entity tables by public access capability.
 * - Standard: tenant+org RLS for all operations
 * - Hybrid: public_access column check for SELECT, tenant+org for writes
 */
const { standardEntityTables, hybridEntityTables } = Object.entries(entityTables).reduce(
  (acc, [entityType, table]) => {
    if (entityType === 'user') return acc;
    const tableName = getTableName(table);
    (hierarchy.canBePublic(entityType) ? acc.hybridEntityTables : acc.standardEntityTables).push(tableName);
    return acc;
  },
  { standardEntityTables: [] as string[], hybridEntityTables: [] as string[] },
);

const membershipTables = [getTableName(membershipsTable), getTableName(inactiveMembershipsTable)];
const rlsTables = [...standardEntityTables, ...hybridEntityTables, ...membershipTables];
const activitiesTable = 'activities';

// ============================================================================
// SQL Building Blocks
// ============================================================================

/** Common expressions used in RLS policies */
const sql = {
  tenantMatch: `tenant_id = current_setting('app.tenant_id', true)`,
  userIdMatch: `user_id = current_setting('app.user_id', true)::uuid`,
  /** Membership check - uses 'id' for organizations table, 'organization_id' for others */
  orgMembership: (table: string) => {
    const orgCol = table === 'organizations' ? 'id' : 'organization_id';
    return `EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.organization_id = ${table}.${orgCol}
        AND m.user_id = current_setting('app.user_id', true)::uuid
    )`;
  },
  tenantAndOrg: (table: string) => `${sql.tenantMatch}\n    AND ${sql.orgMembership(table)}`,
};

/** Generate a single policy (DROP + CREATE) */
function policy(table: string, op: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE', condition: string, isCheck = false): string {
  const name = `${table}_${op.toLowerCase()}`;
  const clause = isCheck ? `WITH CHECK (\n    ${condition}\n  )` : `USING (\n    ${condition}\n  )`;
  return `  DROP POLICY IF EXISTS ${name} ON ${table};
  CREATE POLICY ${name} ON ${table} FOR ${op} ${clause};`;
}

/** Generate all four CRUD policies for a table */
function generatePolicies(
  table: string,
  selectCondition: string,
  writeCondition: string,
  comment: string,
): string {
  return `
  -- ${table}: ${comment}
${policy(table, 'SELECT', selectCondition)}

${policy(table, 'INSERT', writeCondition, true)}

${policy(table, 'UPDATE', writeCondition)}

${policy(table, 'DELETE', writeCondition)}`;
}

// ============================================================================
// Policy Generators by Category
// ============================================================================

/** Standard: tenant + org for all operations */
const standardPolicy = (t: string) => generatePolicies(t, sql.tenantAndOrg(t), sql.tenantAndOrg(t), 'Standard RLS (tenant + org)');

/** Hybrid: public_access OR tenant+org for SELECT, tenant+org for writes */
const hybridPolicy = (t: string) => generatePolicies(t, `public_access = true\n    OR (\n      ${sql.tenantAndOrg(t)}\n    )`, sql.tenantAndOrg(t), 'Hybrid RLS (public_access OR tenant + org)');

/** Membership: user_id for SELECT, tenant for writes */
const membershipPolicy = (t: string) => generatePolicies(t, sql.userIdMatch, sql.tenantMatch, 'Cross-tenant read (user_id), tenant-only writes');

// ============================================================================
// Migration SQL
// ============================================================================

const migrationSql = `-- RLS (Row-Level Security) Setup
-- Configures FORCE RLS, table ownership, grants, and policies.
-- For PGlite: migration is skipped (no role support).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'runtime_role') THEN
    RAISE NOTICE 'Roles not available - skipping RLS setup (e.g., PGlite).';
    RETURN;
  END IF;

  -- Table ownership and FORCE RLS
${rlsTables.map((t) => `  ALTER TABLE ${t} OWNER TO admin_role;`).join('\n')}
  ALTER TABLE ${activitiesTable} OWNER TO admin_role;

${rlsTables.map((t) => `  ALTER TABLE ${t} FORCE ROW LEVEL SECURITY;`).join('\n')}

  -- Grants: runtime_role (subject to RLS)
${rlsTables.map((t) => `  GRANT SELECT, INSERT, UPDATE, DELETE ON ${t} TO runtime_role;`).join('\n')}
  GRANT SELECT ON ${activitiesTable} TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON users TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON tokens TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON passkeys TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON oauth_accounts TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON requests TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON unsubscribe_tokens TO runtime_role;
  GRANT SELECT ON tenants TO runtime_role;

  -- Grants: cdc_role (append-only activities)
  GRANT INSERT ON ${activitiesTable} TO cdc_role;
  GRANT SELECT ON tenants TO cdc_role;
  GRANT SELECT ON organizations TO cdc_role;

  -- Grants: admin_role (full access)
  GRANT ALL ON ALL TABLES IN SCHEMA public TO admin_role;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO admin_role;

  -- RLS Policies
${standardEntityTables.map(standardPolicy).join('\n')}
${hybridEntityTables.map(hybridPolicy).join('\n')}
${membershipTables.map(membershipPolicy).join('\n')}

  RAISE NOTICE 'RLS setup complete.';
END $$;
`;

// ============================================================================
// Execute Migration
// ============================================================================

const result = upsertMigration('rls_setup', migrationSql);
logMigrationResult(result, 'RLS setup');

console.info('');
console.info(`  ${pc.bold(pc.greenBright('Standard RLS:'))} ${standardEntityTables.join(', ') || '(none)'}`);
console.info(`  ${pc.bold(pc.cyanBright('Hybrid RLS:'))} ${hybridEntityTables.join(', ') || '(none)'}`);
console.info(`  ${pc.bold(pc.yellowBright('Membership RLS:'))} ${membershipTables.join(', ')}`);

console.info(`  ${pc.bold(pc.yellowBright('Membership tables:'))}`);
for (const table of membershipTables) {
  console.info(`    - ${table}`);
}
