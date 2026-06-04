import { getTableName } from 'drizzle-orm';
import pc from 'picocolors';
import { appConfig } from 'shared';
import { entityTables } from '#/tables';
import { inactiveMembershipsTable } from '#/db/schema/inactive-memberships';
import { membershipsTable } from '#/db/schema/memberships';
import { yjsDocumentsTable } from '#/db/schema/yjs-documents';
import { logMigrationResult, upsertMigration } from './helpers/drizzle-utils';
import type { GenerateScript } from '../types';

async function run() {
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

  // Context entity and membership tables no longer use RLS — access control is application-layer (guards)
  const contextEntityTableNames = appConfig.contextEntityTypes.map((entityType) => {
    const table = entityTables[entityType as keyof typeof entityTables];
    if (!table) throw new Error(`No table found for context entity type: ${entityType}`);
    return getTableName(table);
  });
  const membershipTableNames = [getTableName(membershipsTable), getTableName(inactiveMembershipsTable)];

  // Pages have no RLS — parentless, always public, protected by sysAdminGuard
  const noRlsProductEntityNames = ['pages'];

  // Only product entity tables + yjs_documents still use RLS (excluding pages)
  const additionalRlsTables = [getTableName(yjsDocumentsTable)];
  const rlsTables = [
    ...entityTableNames.filter((t) => !contextEntityTableNames.includes(t) && !noRlsProductEntityNames.includes(t)),
    ...additionalRlsTables,
  ];

  // Tables without RLS but needing grants (auth, system, context entities, memberships, pages, etc.)
  const fullCrudTables = [
    ...contextEntityTableNames,
    ...membershipTableNames,
    ...noRlsProductEntityNames,
    'users',
    'sessions',
    'user_counters',
    'tokens',
    'passkeys',
    'oauth_accounts',
    'totps',
    'requests',
    'unsubscribe_tokens',
    'emails',
    'rate_limits',
    'context_counters',
    'seen_by',
    'product_counters',
    'domains',
    'tenants',
  ];
  const readOnlyTables = ['system_roles', 'activities'];

  // Product entity tables where CDC needs column-level UPDATE(seq) permission
  const productEntityTableNames = appConfig.productEntityTypes.map((entityType) => {
    const table = entityTables[entityType as keyof typeof entityTables];
    if (!table) throw new Error(`No table found for product entity type: ${entityType}`);
    return getTableName(table);
  });

  // Entity embedding columns where CDC needs UPDATE permission to strip deleted refs
  const embeddingGrants = appConfig.entityEmbeddings.map(({ hostEntity, hostColumn }) => {
    const table = entityTables[hostEntity as keyof typeof entityTables];
    if (!table) throw new Error(`No table found for embedding host entity: ${hostEntity}`);
    return `    GRANT UPDATE (${hostColumn}) ON ${getTableName(table)} TO cdc_role;`;
  });

  // ============================================================================
  // Migration SQL
  // ============================================================================

  const migrationSql = `-- RLS (Row-Level Security) Setup
-- Configures FORCE RLS, table ownership, and grants.
-- Policies are defined in Drizzle schema files using pgPolicy().
-- RLS enforces tenant-level isolation only; org-level isolation is application-layer (orgGuard).
-- Gracefully skips if required roles are not yet created.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'runtime_role') THEN
    RAISE NOTICE 'Roles not available - skipping RLS setup.';
    RETURN;
  END IF;

  BEGIN
    -- Table ownership and FORCE RLS
${rlsTables.map((t) => `    ALTER TABLE ${t} OWNER TO admin_role;`).join('\n')}
    ALTER TABLE activities OWNER TO admin_role;

${rlsTables.map((t) => `    ALTER TABLE ${t} FORCE ROW LEVEL SECURITY;`).join('\n')}

    -- Grants: runtime_role (subject to RLS)
${rlsTables.map((t) => `    GRANT SELECT, INSERT, UPDATE, DELETE ON ${t} TO runtime_role;`).join('\n')}
${fullCrudTables.map((t) => `    GRANT SELECT, INSERT, UPDATE, DELETE ON ${t} TO runtime_role;`).join('\n')}
${readOnlyTables.map((t) => `    GRANT SELECT ON ${t} TO runtime_role;`).join('\n')}

    -- Grants: cdc_role (append-only activities + counter sequences + seq stamping)
    GRANT INSERT ON activities TO cdc_role;
    GRANT SELECT, INSERT, UPDATE ON context_counters TO cdc_role;
    GRANT SELECT ON tenants TO cdc_role;
    GRANT SELECT ON organizations TO cdc_role;
  ${productEntityTableNames.map((t) => `    GRANT SELECT (id, stx), UPDATE (seq, stx) ON ${t} TO cdc_role;`).join('\n')}
${embeddingGrants.join('\n')}

    -- Grants: admin_role (full access)
    GRANT ALL ON ALL TABLES IN SCHEMA public TO admin_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO admin_role;

    -- Grants: pg_catalog usage for JSONB operators
    GRANT USAGE ON SCHEMA pg_catalog TO runtime_role;

    RAISE NOTICE 'RLS setup complete.';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'RLS setup failed: %. Skipping - RLS will not be enforced.', SQLERRM;
  END;
END $$;
`;

  // ============================================================================
  // Execute Migration
  // ============================================================================

  const result = upsertMigration('rls_setup', migrationSql);
  logMigrationResult(result, 'RLS setup');

  console.info('');
  console.info(`  ${pc.greenBright('RLS tables:')} ${rlsTables.join(', ')}`);
  console.info('');
}

export const generateConfig: GenerateScript = {
  name: 'RLS',
  type: 'migration',
  run,
};
