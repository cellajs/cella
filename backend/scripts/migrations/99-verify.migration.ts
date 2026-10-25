import { getTableName } from 'drizzle-orm';
import {
  adminOnlyWriteTriggerName,
  allAdminOnlyWriteTables,
  allImmutabilityTables,
  immutableKeysTriggerName,
} from '#/db/immutability-triggers';
import { membershipRuleTriggers } from '#/db/membership-rules';
import { rlsPolicyContract } from '#/db/rls-helpers';
import { entityTables, resourceTables } from '#/tables';
import { publicationRowFilter } from '#/db/utils/publication-filter';
import { cdcPublicationName } from '../../../cdc/src/constants';
import type { SideEffectBlock, SideEffectProducer } from '../types';
import { deletionQueueTriggers } from './10-deletion-queue.migration';
import { partitionConfigs, retentionProcedure } from './10-retention.migration';
import { classifyRlsTables } from './10-rls.migration';
import { loggedAgainTables, unloggedTables } from './10-unlogged.migration';

const PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const;

/** A `text[]` literal. Items go in unquoted, so each must be a plain identifier. */
function textArray(items: readonly string[]): string {
  const unsafe = items.find((item) => !/^\w+$/.test(item));
  if (unsafe !== undefined) throw new Error(`verify: '${unsafe}' is not a plain identifier`);
  return `'{${items.join(',')}}'::text[]`;
}

/**
 * Builds the final assertions for the combined side-effect migration, causing any missing
 * end state to roll back the transaction. Assertions share producer preconditions and
 * derive expected state from the same TypeScript sources: table classification from
 * `10-rls`, the policy set from `rls-helpers`, triggers from `immutability-triggers` and `membership-rules`.
 * Each check is one query over arrays of expected objects that appends what the catalog lacks.
 */
async function run(): Promise<SideEffectBlock> {
  const { rlsTables, fullCrudTables, readOnlyTables } = classifyRlsTables();
  const crudTables = [...rlsTables, ...fullCrudTables];
  const ownedTables = [...rlsTables, 'activities'];
  const expectedTriggers = [
    ...allImmutabilityTables.map(({ tableName }) => ({ tableName, triggerName: immutableKeysTriggerName(tableName) })),
    ...allAdminOnlyWriteTables.map(({ tableName }) => ({ tableName, triggerName: adminOnlyWriteTriggerName(tableName) })),
    ...membershipRuleTriggers,
    ...deletionQueueTriggers,
  ];
  const functionNames = [
    ...new Set([...allImmutabilityTables, ...allAdminOnlyWriteTables].map((t) => t.functionName)),
    ...membershipRuleTriggers.map((t) => t.functionName),
    ...deletionQueueTriggers.map((t) => t.functionName),
    'apply_count_deltas',
    'fold_search',
  ];
  const publicationTableCount = [...Object.values(entityTables), ...Object.values(resourceTables)].map(getTableName).length;
  // Draft-lifecycle product tables carry a publication row filter (the draft boundary).
  const rowFilteredCount = Object.entries(entityTables).filter(([entityType, table]) =>
    publicationRowFilter(entityType, table),
  ).length;

  const policyCount = Object.keys(rlsPolicyContract('x')).length;
  const policies = rlsTables.flatMap((table) => Object.values(rlsPolicyContract(table)).map((policy) => ({ table, ...policy })));
  const persistence = [...unloggedTables.map((table) => ({ table, kind: 'u' })), ...loggedAgainTables.map((table) => ({ table, kind: 'p' }))];
  const partitionedTables = textArray(partitionConfigs.map(({ name }) => name));
  const inPublic = `relnamespace = 'public'::regnamespace`;

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
  missing := missing || ARRAY(
    SELECT 'function:' || e.fn FROM unnest(${textArray(functionNames)}) AS e(fn)
    WHERE NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = e.fn));

  -- Immutability, write-guard and membership rule triggers
  missing := missing || ARRAY(
    SELECT 'trigger:' || e.tg
    FROM unnest(${textArray(expectedTriggers.map((t) => t.tableName))}, ${textArray(expectedTriggers.map((t) => t.triggerName))}) AS e(tbl, tg)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.${inPublic} AND c.relname = e.tbl AND t.tgname = e.tg AND NOT t.tgisinternal));

  -- Ownership and enabled (not forced) RLS: the owner (admin_role) bypasses the policies natively,
  -- the only bypass a managed provider can give the CDC worker and the admin connection.
  missing := missing || ARRAY(
    SELECT 'owner:' || e.tbl FROM unnest(${textArray(ownedTables)}) AS e(tbl)
    WHERE (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE relname = e.tbl AND ${inPublic}) IS DISTINCT FROM 'admin_role');
  missing := missing || ARRAY(
    SELECT 'rls-enabled-not-forced:' || e.tbl FROM unnest(${textArray(rlsTables)}) AS e(tbl)
    WHERE NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = e.tbl AND ${inPublic} AND relrowsecurity AND NOT relforcerowsecurity));

  -- Policy contract (${rlsTables.length} tables x ${policyCount} policies): every policy on an RLS table is one of the
  -- contract's, with its command, permissive mode, PUBLIC target and expression shape; a fifth policy fails the count.
  missing := missing || ARRAY(
    SELECT 'policy:' || e.name
    FROM unnest(${textArray(policies.map((p) => p.table))}, ${textArray(policies.map((p) => p.name))},
      ${textArray(policies.map((p) => p.command))}, ${textArray(policies.map((p) => p.expression))}) AS e(tbl, name, cmd, expression)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      WHERE c.relname = e.tbl AND c.${inPublic} AND p.polname = e.name AND p.polcmd::text = e.cmd
        AND p.polpermissive AND p.polroles = '{0}'::oid[]
        AND CASE e.expression
          WHEN 'tenant' THEN pg_get_expr(p.polqual, p.polrelid) LIKE '%app.tenant_id%'
            AND pg_get_expr(p.polqual, p.polrelid) LIKE '%tenant_id)::text = ( SELECT current_setting(''app.tenant_id''%'
          ELSE COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), pg_get_expr(p.polqual, p.polrelid)) = 'true'
        END));
  missing := missing || ARRAY(
    SELECT 'policy-count:' || e.tbl FROM unnest(${textArray(rlsTables)}) AS e(tbl)
    WHERE (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relname = e.tbl AND c.${inPublic}) <> ${policyCount});

  -- Grants per classification: CRUD tables hold every privilege, read-only tables SELECT and nothing else
  missing := missing || ARRAY(
    SELECT CASE WHEN g.expected THEN 'grant:' ELSE 'grant-excess:' END || g.tbl || ':' || g.priv
    FROM (
      SELECT tbl, priv, true FROM unnest(${textArray(crudTables)}) AS tbl, unnest(${textArray(PRIVILEGES)}) AS priv
      UNION ALL
      SELECT tbl, priv, priv = 'SELECT' FROM unnest(${textArray(readOnlyTables)}) AS tbl, unnest(${textArray(PRIVILEGES)}) AS priv
    ) AS g(tbl, priv, expected)
    WHERE has_table_privilege('runtime_role', 'public.' || g.tbl, g.priv) <> g.expected);

  -- UNLOGGED, and tables logged again
  missing := missing || ARRAY(
    SELECT CASE e.kind WHEN 'u' THEN 'unlogged:' ELSE 'logged:' END || e.tbl
    FROM unnest(${textArray(persistence.map((p) => p.table))}, ${textArray(persistence.map((p) => p.kind))}) AS e(tbl, kind)
    WHERE (SELECT relpersistence::text FROM pg_class WHERE relname = e.tbl AND ${inPublic}) IS DISTINCT FROM e.kind);

  -- Partitioning and its maintenance procedure (and nothing partitioned beyond the configs)
  missing := missing || ARRAY(
    SELECT 'partitioned:' || e.tbl FROM unnest(${partitionedTables}) AS e(tbl)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_partitioned_table pt JOIN pg_class c ON c.oid = pt.partrelid WHERE c.relname = e.tbl AND c.${inPublic}));
  IF EXISTS (
    SELECT 1 FROM pg_partitioned_table pt JOIN pg_class c ON c.oid = pt.partrelid
    WHERE c.${inPublic} AND c.relname::text <> ALL (${partitionedTables})
  ) THEN missing := array_append(missing, 'unexpected-partitioned-table'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = '${retentionProcedure}' AND pronamespace = 'public'::regnamespace) THEN
    missing := array_append(missing, 'procedure:${retentionProcedure}'); END IF;

  -- CDC publication (${publicationTableCount} tracked tables)
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = '${cdcPublicationName}') THEN
    missing := array_append(missing, 'publication:${cdcPublicationName}');
  ELSIF (SELECT count(DISTINCT tablename) FROM pg_publication_tables WHERE pubname = '${cdcPublicationName}') <> ${publicationTableCount} THEN
    missing := array_append(missing, 'publication-tables:${cdcPublicationName}');
  ELSIF (SELECT count(*) FROM pg_publication_tables WHERE pubname = '${cdcPublicationName}' AND rowfilter IS NOT NULL) <> ${rowFilteredCount} THEN
    missing := array_append(missing, 'publication-rowfilters:${cdcPublicationName}');
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
      `asserts: ${expectedTriggers.length} triggers, ${functionNames.length} functions, ${partitionConfigs.length} partitioned tables, ${ownedTables.length} owners, ${rlsTables.length} RLS tables (enabled, not forced), ${rlsTables.length * policyCount} policies, ${crudTables.length} CRUD + ${readOnlyTables.length} read-only grant sets, ${unloggedTables.length} unlogged, ${loggedAgainTables.length} logged again, 1 publication, runtime_role not BYPASSRLS`,
    ],
  };
}

export const sideEffect: SideEffectProducer = {
  name: 'Verify',
  produce: run,
};
