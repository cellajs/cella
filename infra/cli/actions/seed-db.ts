import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { confirm } from '@inquirer/prompts';
import { pulumiConfigRm, pulumiConfigSet } from '../../lib/stack/pulumi-up';
import { checkMark, crossMark, pc, warningMark } from '../../lib/utils/cli-output';
import { infraDir } from '../../lib/utils/paths';
import type { InfraContext } from '../shared';
import {
  DB_ACL_KEY,
  DB_ENDPOINT_KEY,
  detectPublicIp,
  readDbCa,
  readPublicDsn,
  removeExposureOverlay,
  writeExposureOverlay,
} from './db-exposure';
import { runPrivilegedConverge } from './privileged-converge';

/**
 * One guarded flow for demo data on a non-production environment: temporarily
 * expose the database to THIS machine's IP, run the backend seeds against it,
 * and close the endpoint again (also on failure). Refuses production.
 */
export async function runSeedDatabase(context: InfraContext): Promise<void> {
  if (context.environment === 'production') {
    console.error(`${crossMark} Seeding refuses to run against production.`);
    process.exit(1);
  }

  console.info(pc.dim('\nSeed database: expose to your IP -> run backend seeds -> close the endpoint.\n'));
  const detected = await detectPublicIp();
  if (!detected) {
    console.error(
      `${crossMark} Could not detect your public IP; use "Expose database publicly" + manual seeding instead.`,
    );
    process.exit(1);
  }
  console.info(`Seeds run from this machine over a temporary endpoint restricted to ${pc.cyan(`${detected}/32`)}.`);
  if (!(await confirm({ message: `Seed the ${context.environment} database now?`, default: false }))) {
    console.info('Aborted; no changes made.');
    return;
  }

  const { env, stack, completed } = await runPrivilegedConverge(context, {
    operation: 'seed-db',
    prepare: (e, s) => {
      // Exposure keys go into the gitignored overlay, never the committed stack
      // config; see db-exposure.ts.
      const overlay = writeExposureOverlay(context.stackPath, context.environment);
      pulumiConfigSet(e, s, DB_ENDPOINT_KEY, 'true', { configFile: overlay });
      pulumiConfigSet(e, s, DB_ACL_KEY, `${detected}/32`, { secret: true, configFile: overlay });
      return overlay;
    },
  });
  if (!completed) {
    console.error(`${crossMark} converge did not complete; run "Stop public DB exposure" to ensure it is closed.`);
    process.exit(1);
  }

  try {
    const dsn = readPublicDsn(env, stack);
    if (!dsn) throw new Error('public DSN output empty; the endpoint may still be provisioning — re-run to seed.');
    // Pin the instance CA so the seed's admin-role connection verifies the
    // server (backend's verifiedPostgresSsl upgrades to verify-full + hostname
    // pinning when DATABASE_SSL_CA is present).
    const dbCa = readDbCa(env, stack);
    if (!dbCa) console.warn(`${warningMark} DB CA output unavailable; seeding over encrypt-only TLS.`);
    console.info(pc.dim('\n-> Running backend seeds against the temporary endpoint...\n'));
    // Dev-mode env from backend/.env stays authoritative for everything except
    // the database target; seeded rows are environment-agnostic data.
    const result = spawnSync('pnpm', ['--filter', 'backend', 'seed'], {
      cwd: resolve(infraDir, '..'),
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: dsn, DATABASE_ADMIN_URL: dsn, ...(dbCa ? { DATABASE_SSL_CA: dbCa } : {}) },
    });
    if (result.status !== 0) throw new Error(`backend seed exited ${result.status}`);
    console.info(`\n${checkMark} ${pc.bold('Seeds completed.')}`);
  } finally {
    console.info(pc.dim('\n-> Closing the public endpoint...\n'));
    const closed = await runPrivilegedConverge(context, {
      operation: 'unseed-db',
      prepare: (e, s) => {
        // Compat cleanup for stacks that predate the overlay; converging the
        // committed (key-free) config is what closes the endpoint.
        if (context.stackYaml?.includes(DB_ENDPOINT_KEY)) pulumiConfigRm(e, s, DB_ENDPOINT_KEY);
        if (context.stackYaml?.includes(DB_ACL_KEY)) pulumiConfigRm(e, s, DB_ACL_KEY);
        return undefined;
      },
    }).then(
      (result) => {
        if (!result.completed) return false;
        removeExposureOverlay(context.environment);
        return true;
      },
      (err) => {
        console.error(
          `${warningMark} closing the endpoint failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return false;
      },
    );
    if (closed) console.info(`${checkMark} Public endpoint closed; database is private-only again.`);
    else console.error(`${crossMark} Run "Stop public DB exposure" to close it manually.`);
  }
}
