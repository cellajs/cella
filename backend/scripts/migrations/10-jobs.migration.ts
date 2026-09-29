import { JOBS_SCHEMA } from '#/lib/pg-boss';
import type { SideEffectBlock, SideEffectProducer } from '../types';

/**
 * Privileges the runtime role needs on the job store. pg-boss installs and upgrades the schema on
 * the admin DSN (the migrate companion, `install-jobs-schema.ts`); every runtime process then
 * enqueues, works and supervises as `runtime_role` through these grants. Default privileges cover
 * the tables pg-boss creates later (partitioned queues, queue-stats partitions). Skips when the
 * schema does not exist yet: a fresh database installs the store right after this migration and
 * applies the same grants then.
 * @param schema - The pg-boss schema name.
 */
export function jobsGrantsSql(schema: string): string {
  return `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = '${schema}') THEN
    RAISE NOTICE 'Skipping job store grants - schema ${schema} not installed yet.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'runtime_role') THEN
    RAISE NOTICE 'Skipping job store grants - roles not available.';
    RETURN;
  END IF;

  GRANT USAGE ON SCHEMA ${schema} TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA ${schema} TO runtime_role;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO runtime_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO runtime_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT USAGE, SELECT ON SEQUENCES TO runtime_role;

  RAISE NOTICE 'Job store grants complete.';
END $$;
`;
}

async function run(): Promise<SideEffectBlock> {
  const migrationSql = `-- Job store (pg-boss) privileges for runtime_role
-- The schema itself is installed by the migrate companion on the admin DSN; see
-- backend/scripts/db/install-jobs-schema.ts, which applies these same grants right after installing.
${jobsGrantsSql(JOBS_SCHEMA)}`;

  return {
    tag: 'jobs_grants',
    title: 'Job store privileges',
    sql: migrationSql,
    notes: [`Job store schema: ${JOBS_SCHEMA} (runtime_role: table privileges, default privileges for later tables)`],
  };
}

export const sideEffect: SideEffectProducer = {
  name: 'Jobs',
  produce: run,
};
