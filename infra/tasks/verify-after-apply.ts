import type { EngineConfig } from '../config/engine-config';
import { deriveInfra } from '../lib/naming';
import { expectedDbPrivileges } from '../lib/scaleway/db-privileges';
import { createRdbClient } from '../lib/scaleway/scaleway-rdb';
import type { FetchLike } from '../lib/utils/fetch-like';

export interface VerifyAfterApplyOptions {
  appConfig: EngineConfig;
  /** A key with RDB read: the operator's. */
  secretKey: string;
  fetchImpl?: FetchLike;
  log?: (msg: string) => void;
}

export interface VerifyAfterApplyResult {
  ok: boolean;
  /** Verified differences between live and declared, one per failed check. */
  problems: string[];
  /** Checks that could not run (an auth or network failure): the live state is unknown there, not wrong. */
  errors: string[];
}

/**
 * Prove a privileged `pulumi up` took effect where it matters: the database privileges the program declares exist live. Pulumi reporting an
 * update is not proof: one provider update was recorded in state while Scaleway kept the old value, and the next deploy failed on it.
 */
export async function verifyAfterApply(opts: VerifyAfterApplyOptions): Promise<VerifyAfterApplyResult> {
  const log = opts.log ?? ((msg) => console.info(msg));
  const problems: string[] = [];
  const errors: string[] = [];

  const { naming, region } = deriveInfra(opts.appConfig);
  const rdb = createRdbClient({ secretKey: opts.secretKey, region, fetchImpl: opts.fetchImpl });
  try {
    const instance = await rdb.findInstance(naming.resource('postgres'));
    if (!instance) {
      problems.push(`database instance ${naming.resource('postgres')} not found in ${region}`);
    } else {
      const byDatabase = new Map<string, Awaited<ReturnType<typeof rdb.listPrivileges>>>();
      for (const expected of expectedDbPrivileges(naming.dbName)) {
        if (!byDatabase.has(expected.database)) {
          byDatabase.set(expected.database, await rdb.listPrivileges(instance.id, expected.database));
        }
        const live = byDatabase.get(expected.database)?.find((privilege) => privilege.user_name === expected.user);
        if (!live || !expected.acceptable.includes(live.permission)) {
          problems.push(
            `database privilege ${expected.user} on ${expected.database}: live '${live?.permission ?? 'none'}', expected one of ${expected.acceptable.join('/')}`,
          );
        } else {
          log(`  ✓ database privilege ${expected.user} on ${expected.database}: ${live.permission}`);
        }
      }
    }
  } catch (error) {
    errors.push(`database privileges: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { ok: problems.length === 0 && errors.length === 0, problems, errors };
}
