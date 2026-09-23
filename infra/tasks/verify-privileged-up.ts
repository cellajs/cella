import type { EngineConfig } from '../config/engine-config';
import { deriveInfra } from '../lib/naming';
import { expectedDbPrivileges } from '../lib/scaleway/db-privileges';
import { createRdbClient } from '../lib/scaleway/scaleway-rdb';
import { buildVmAssertRows } from '../lib/scaleway/vm-assert-rows';
import type { FetchLike } from '../lib/utils/fetch-like';
import { assertVmGrants } from './assert-vm-grants';

export interface VerifyPrivilegedUpOptions {
  appConfig: EngineConfig;
  projectId: string;
  organizationId: string;
  /** A key with IAM read and RDB read (the bootstrap key qualifies). */
  secretKey: string;
  fetchImpl?: FetchLike;
  log?: (msg: string) => void;
  /** Injected for tests; defaults to the real grant assertion. */
  assertGrants?: typeof assertVmGrants;
}

export interface VerifyPrivilegedUpResult {
  ok: boolean;
  /** Human problems, one per failed check. */
  problems: string[];
}

/**
 * Prove a privileged `pulumi up` took effect where it matters: every VM/boot/CI principal holds exactly the grant the program declares, with the
 * exact secret condition and project scope, and the database privileges the program declares exist live. Pulumi reporting an update is not proof:
 * one provider update was recorded in state while Scaleway kept the old rule, and the next deploy failed on it.
 */
export async function verifyPrivilegedUp(opts: VerifyPrivilegedUpOptions): Promise<VerifyPrivilegedUpResult> {
  const log = opts.log ?? ((msg) => console.info(msg));
  const assertGrants = opts.assertGrants ?? assertVmGrants;
  const problems: string[] = [];

  for (const row of buildVmAssertRows(opts.appConfig)) {
    try {
      const result = await assertGrants({
        secretKey: opts.secretKey,
        applicationName: row.app,
        projectId: opts.projectId,
        organizationId: opts.organizationId,
        required: row.sets,
        requiredSecretCondition: row.condition || undefined,
        requiredProjectId: row.condition ? opts.projectId : undefined,
        dormant: row.dormant,
        fetchImpl: opts.fetchImpl,
        log: (msg) => log(`  ${row.app}: ${msg}`),
      });
      if (!result.ok) problems.push(`${row.app}: live grant differs from the declared one (see the lines above)`);
    } catch (error) {
      problems.push(`${row.app}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

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
    problems.push(`database privileges: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { ok: problems.length === 0, problems };
}
