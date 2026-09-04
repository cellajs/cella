import { getTableName } from 'drizzle-orm';
import {
  adminOnlyWriteTriggerName,
  allAdminOnlyWriteTables,
  allImmutabilityTables,
  immutableKeysTriggerName,
} from '#/db/immutability-triggers';
import { rlsPolicyContract } from '#/db/rls-helpers';
import { entityTables, resourceTables } from '#/tables';
import { publicationRowFilter } from '#/db/utils/publication-filter';
import { CDC_PUBLICATION_NAME } from '../../../cdc/src/constants';
import type { SideEffectBlock, SideEffectProducer } from '../types';
import { partitionConfigs } from './10-partman.migration';
import { classifyRlsTables } from './10-rls.migration';
import { unloggedTables } from './10-unlogged.migration';

const PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const;

/**
 * Builds the final assertions for the combined side-effect migration, causing any missing
 * end state to roll back the transaction. Assertions share producer preconditions and
 * derive expected state from the same TypeScript sources: table classification from
 * `10-rls`, the policy set from `rls-helpers`, triggers from `immutability-triggers`.
 */
async function run(): Promise<SideEffectBlock> {
  const { rlsTables, fullCrudTables, readOnlyTables } = classifyRlsTables();
  const crudTables = [...rlsTables, ...fullCrudTables];
  const ownedTables = [...rlsTables, 'activities'];
  const expectedTriggers = [
    ...allImmutabilityTables.map(({ tableName }) => ({ tableName, triggerName: immutableKeysTriggerName(tableName) })),
    ...allAdminOnlyWriteTables.map(({ tableName }) => ({ tableName, triggerName: adminOnlyWriteTriggerName(tableName) })),
  ];
  const functionNames = [
    ...new Set([...allImmutabilityTables, ...allAdminOnlyWriteTables].map((t) => t.functionName)),
    'apply_count_deltas',
  ];
  const publicationTableCount = [...Object.values(entityTables), ...Object.values(resourceTables)].map(getTableName).length;
  // Draft-lifecycle product tables carry a publication row filter (the draft boundary).
  const rowFilteredCount = Object.entries(entityTables).filter(([entityType, table]) =>
    publicationRowFilter(entityType, table),
  ).length;

  const inPublic = (t: string) => `relname = '${t}' AND relnamespace = 'public'::regnamespace`;
  const policyCount = Object.keys(rlsPolicyContract('x')).length;

  const triggerChecks = expectedTriggers
    .map(
      ({ tableName, triggerName }) => `  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relnamespace = 'public'::regnamespace AND c.relname = '${tableName}'
      AND t.tgname = '${triggerName}' AND NOT t.tgisinternal
  ) THEN missing := array_append(missing, 'trigger:${triggerName}'); END IF;`,
    )
    .join('\n');

  const functionChecks = functionNames
    .map(
      (fn) => `  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = '${fn}') THEN
    missing := array_append(missing, 'function:${fn}'); END IF;`,
    )
    .join('\n');

  const partitionChecks = partitionConfigs
    .map(
      ({ name }) => `    IF NOT EXISTS (
      SELECT 1 FROM pg_partitioned_table pt JOIN pg_class c ON c.oid = pt.partrelid
      WHERE c.relname = '${name}' AND c.relnamespace = 'public'::regnamespace
    ) THEN missing := array_append(missing, 'partitioned:${name}'); END IF;`,
    )
    .join('\n');

  // Enabled but never forced: the owner (admin_role) bypasses the policies natively, which is the
  // only bypass a managed provider can give the CDC worker and the admin connection.
  const rlsEnabledChecks = rlsTables
    .map(
      (t) => `  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE ${inPublic(t)} AND relrowsecurity AND NOT relforcerowsecurity
  ) THEN missing := array_append(missing, 'rls-enabled-not-forced:${t}'); END IF;`,
    )
    .join('\n');

  const ownerChecks = ownedTables
    .map(
      (t) => `  IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE ${inPublic(t)}) IS DISTINCT FROM 'admin_role' THEN
    missing := array_append(missing, 'owner:${t}'); END IF;`,
    )
    .join('\n');

  // Every policy on an RLS table must be one of the contract's four, with its command, permissive
  // mode, PUBLIC target and expression shape; a fifth policy or a drifted expression fails too.
  const policyChecks = rlsTables
    .flatMap((t) => {
      const contract = Object.values(rlsPolicyContract(t));
      const perPolicy = contract.map(({ name, command, expression }) => {
        const expressionCheck =
          expression === 'tenant'
            ? `pg_get_expr(p.polqual, p.polrelid) LIKE '%app.tenant_id%' AND pg_get_expr(p.polqual, p.polrelid) LIKE '%tenant_id)::text = current_setting%'`
            : `COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), pg_get_expr(p.polqual, p.polrelid)) = 'true'`;
        return `  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.${inPublic(t)} AND p.polname = '${name}' AND p.polcmd = '${command}'
      AND p.polpermissive AND p.polroles = '{0}'::oid[] AND ${expressionCheck}
  ) THEN missing := array_append(missing, 'policy:${name}'); END IF;`;
      });
      const count = `  IF (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.${inPublic(t)}) <> ${contract.length} THEN
    missing := array_append(missing, 'policy-count:${t}'); END IF;`;
      return [...perPolicy, count];
    })
    .join('\n');

  // CRUD tables hold every privilege; read-only tables hold SELECT and nothing else.
  const grantCheck = (t: string, priv: string, expected: boolean) =>
    `  IF ${expected ? 'NOT ' : ''}has_table_privilege('runtime_role', 'public.${t}', '${priv}') THEN
    missing := array_append(missing, '${expected ? 'grant' : 'grant-excess'}:${t}:${priv}'); END IF;`;
  const grantChecks = [
    ...crudTables.flatMap((t) => PRIVILEGES.map((priv) => grantCheck(t, priv, true))),
    ...readOnlyTables.flatMap((t) => PRIVILEGES.map((priv) => grantCheck(t, priv, priv === 'SELECT'))),
  ].join('\n');

  const unloggedChecks = unloggedTables
    .map(
      (t) => `  IF (SELECT relpersistence FROM pg_class WHERE ${inPublic(t)}) IS DISTINCT FROM 'u' THEN
    missing := array_append(missing, 'unlogged:${t}'); END IF;`,
    )
    .join('\n');

  const migrationSql = `-- Side-effect verification
-- Asserts the end state of every previous block. A failed assertion aborts (and rolls
-- back) the whole migration instead of shipping a silently degraded database.

DO $$
DECLARE
  missing text[] := '{}';
BEGIN
  -- Roles are a hard precondition: without them the RLS, trigger and grant blocks could not
  -- have run, and a database that skipped them must never pass verification.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'runtime_role')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'admin_role') THEN
    RAISE EXCEPTION 'verify: runtime_role and admin_role must exist before migrations run (create-db-roles, or provider-managed users)';
  END IF;

  -- The runtime role must stay RLS-subject.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'runtime_role' AND (rolbypassrls OR rolsuper)) THEN
    missing := array_append(missing, 'role:runtime_role:bypasses-rls');
  END IF;

  -- Functions (created unconditionally by their blocks)
${functionChecks}

  -- Immutability triggers
${triggerChecks}

  -- Ownership and enabled (not forced) RLS
${ownerChecks}

${rlsEnabledChecks}

  -- Policy contract (${rlsTables.length} tables x ${policyCount} policies)
${policyChecks}

  -- Grants per classification
${grantChecks}

  -- UNLOGGED
${unloggedChecks}

  -- Partitioning (same precondition as the partman block: extension installed)
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_partman') THEN
${partitionChecks}
  ELSE
    RAISE NOTICE 'verify: pg_partman not installed - skipping partition assertions.';
  END IF;

  -- CDC publication (${publicationTableCount} tracked tables)
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = '${CDC_PUBLICATION_NAME}') THEN
    missing := array_append(missing, 'publication:${CDC_PUBLICATION_NAME}');
  ELSIF (SELECT count(DISTINCT tablename) FROM pg_publication_tables WHERE pubname = '${CDC_PUBLICATION_NAME}') <> ${publicationTableCount} THEN
    missing := array_append(missing, 'publication-tables:${CDC_PUBLICATION_NAME}');
  ELSIF (SELECT count(*) FROM pg_publication_tables WHERE pubname = '${CDC_PUBLICATION_NAME}' AND rowfilter IS NOT NULL) <> ${rowFilteredCount} THEN
    missing := array_append(missing, 'publication-rowfilters:${CDC_PUBLICATION_NAME}');
  END IF;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'DB side-effect verification failed, missing: %', array_to_string(missing, ', ');
  END IF;

  RAISE NOTICE 'Side-effect verification passed.';
END $$;
`;

  return {
    tag: 'verify_side_effects',
    title: 'Verify, assert end state of all side-effect blocks',
    sql: migrationSql,
    notes: [
      `asserts: ${expectedTriggers.length} triggers, ${functionNames.length} functions, ${partitionConfigs.length} partitioned tables, ${ownedTables.length} owners, ${rlsTables.length} RLS tables (enabled, not forced), ${rlsTables.length * policyCount} policies, ${crudTables.length} CRUD + ${readOnlyTables.length} read-only grant sets, ${unloggedTables.length} unlogged, 1 publication, runtime_role not BYPASSRLS`,
    ],
  };
}

export const sideEffect: SideEffectProducer = {
  name: 'Verify',
  produce: run,
};
