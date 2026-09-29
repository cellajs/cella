import { type ConstructorOptions, PgBoss } from 'pg-boss';
import { appConfig } from 'shared';
import { resolvePostgresSslCa, stripPostgresSslParams, verifiedPostgresSsl } from 'shared/utils/postgres-tls';
import { env } from '#/env';
import { baseLog } from '#/lib/pino';

/**
 * What a process does with the job store. `producer` only enqueues (the API), `worker` also runs
 * handlers, `maintainer` additionally owns cron and queue supervision: one process per deployment,
 * the jobs service. Each role is a superset of the one before it.
 */
export type JobsRole = 'producer' | 'worker' | 'maintainer';

const roleRank: Record<JobsRole, number> = { producer: 0, worker: 1, maintainer: 2 };

/** pg-boss schema; tests use their own so the shared test database never touches a development store. */
export const JOBS_SCHEMA = appConfig.mode === 'test' ? 'pgboss_test' : 'pgboss';

/** Per-process listener connection on top of this pool: the budget in DB-DEV-S terms is 5 + 1 per worker. */
const POOL_MAX: Record<JobsRole, number> = { producer: 2, worker: 5, maintainer: 5 };

const sslCa = resolvePostgresSslCa(env.DATABASE_SSL_CA, env.NODE_ENV === 'production' && !env.NODB);

/**
 * pg-boss options for a role on the runtime DSN. Every role runs with `migrate: false`: the migrate
 * companion installs and upgrades the schema on the admin DSN (`installJobsSchema`), and the runtime
 * role holds table privileges on it. `reindex` is off because index rebuilds need the table owner;
 * bloat is still detected and reported as a warning.
 */
export function jobsOptions(role: JobsRole, overrides: Partial<ConstructorOptions> = {}): ConstructorOptions {
  const url = overrides.connectionString ?? env.DATABASE_URL;
  return {
    connectionString: stripPostgresSslParams(url),
    ssl: verifiedPostgresSsl(url, sslCa),
    application_name: `${appConfig.slug}-jobs-${role}`,
    schema: JOBS_SCHEMA,
    max: POOL_MAX[role],
    migrate: false,
    createSchema: false,
    supervise: role === 'maintainer',
    schedule: role === 'maintainer',
    useListenNotify: role !== 'producer',
    reindex: false,
    ...overrides,
  };
}

let boss: PgBoss | undefined;
let bossRole: JobsRole | undefined;

/**
 * The process-wide pg-boss instance, started on first use. The first caller fixes the role; a later
 * caller may ask for the same or a lesser role (a maintainer also produces), never a greater one,
 * so a process that must maintain starts the jobs worker before anything enqueues.
 */
export async function getPgBoss(role: JobsRole): Promise<PgBoss> {
  if (boss && bossRole) {
    if (roleRank[role] > roleRank[bossRole]) {
      throw new Error(`pg-boss already runs as ${bossRole} in this process; a ${role} needs its own start`);
    }
    return boss;
  }
  const instance = new PgBoss(jobsOptions(role));
  instance.on('error', (err) => baseLog.error('pg-boss error', { err }));
  instance.on('warning', (warning) => baseLog.warn(`pg-boss warning: ${warning.message}`, { data: warning.data }));
  await instance.start();
  boss = instance;
  bossRole = role;
  return instance;
}

/** Stops the instance started by {@link getPgBoss}; handlers finish their current jobs first. */
export async function stopPgBoss(): Promise<void> {
  if (!boss) return;
  const instance = boss;
  boss = undefined;
  bossRole = undefined;
  await instance.stop({ graceful: true, timeout: 8_000 });
}
