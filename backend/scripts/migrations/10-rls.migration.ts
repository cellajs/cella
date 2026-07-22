import { getTableName } from 'drizzle-orm';
import { appConfig } from 'shared';
import { entityTables } from '#/tables';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { yjsDocumentsTable } from '#/modules/yjs/yjs-db';
import type { SideEffectBlock, SideEffectProducer } from '../types';

/**
 * Classify tables for RLS setup (ownership, FORCE RLS, grants).
 * Policies are defined in Drizzle schema files using pgPolicy() - not generated here.
 * Exported so the verify block (99-verify) asserts against the exact same lists.
 */
export function classifyRlsTables(): { rlsTables: string[]; fullCrudTables: string[]; readOnlyTables: string[] } {
  const entityTableNames = Object.entries(entityTables)
    .filter(([entityType]) => entityType !== 'user')
    .map(([, table]) => getTableName(table));

  // Channel entity and membership tables use application-layer guards for access control.
  const channelTableNames = appConfig.channelEntityTypes.map((entityType) => {
    const table = entityTables[entityType as keyof typeof entityTables];
    if (!table) throw new Error(`No table found for channel entity type: ${entityType}`);
    return getTableName(table);
  });
  const membershipTableNames = [getTableName(membershipsTable), getTableName(inactiveMembershipsTable)];

  // Products excluded from RLS (parentless, always public, protected by sysAdminGuard).
  // Filtered by the tables that actually exist: a fork without these modules must not
  // emit grants for nonexistent tables because one failed statement rolls back the whole
  // grant block (see the exception handler below).
  const noRlsCandidates = ['pages'];
  const noRlsProductNames = noRlsCandidates.filter((name) => (entityTableNames as string[]).includes(name));

  // Only product entity tables + yjs_documents still use RLS (excluding pages)
  const additionalRlsTables = [getTableName(yjsDocumentsTable)];
  const rlsTables = [
    ...entityTableNames.filter((t) => !channelTableNames.includes(t) && !noRlsProductNames.includes(t)),
    ...additionalRlsTables,
  ];

  // Tables without RLS but needing grants (auth, system, channel entities, memberships, pages, etc.)
  const fullCrudTables = [
    ...channelTableNames,
    ...membershipTableNames,
    ...noRlsProductNames,
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
    'channel_counters',
    'seen_by',
    'product_counters',
    'domains',
    'tenants',
  ];
  const readOnlyTables = ['system_roles', 'activities'];

  return { rlsTables, fullCrudTables, readOnlyTables };
}

async function run(): Promise<SideEffectBlock> {
  const { rlsTables, fullCrudTables, readOnlyTables } = classifyRlsTables();

  // Migration SQL

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

    -- Grants: admin_role (full access; also used by the CDC worker)
    GRANT ALL ON ALL TABLES IN SCHEMA public TO admin_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO admin_role;

    -- Grants: pg_catalog usage for JSONB operators
    GRANT USAGE ON SCHEMA pg_catalog TO runtime_role;

    RAISE NOTICE 'RLS setup complete.';
  EXCEPTION WHEN OTHERS THEN
    -- Fail LOUDLY: swallowing this rolled back ownership, FORCE RLS and every grant in
    -- one silent NOTICE — the app then boots with no table grants (every request 403s)
    -- or, worse, without enforced RLS.
    RAISE EXCEPTION 'RLS setup failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
  END;
END $$;
`;

  return {
    tag: 'rls_setup',
    title: 'RLS — ownership, FORCE RLS, grants',
    sql: migrationSql,
    notes: [`RLS tables: ${rlsTables.join(', ')}`],
  };
}

export const sideEffect: SideEffectProducer = {
  name: 'RLS',
  produce: run,
};
