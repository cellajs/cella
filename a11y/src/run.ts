import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseEnv } from 'node:util';
import { appConfig } from 'shared';
import { repoRoot } from './session.ts';

/**
 * The whole audit in one command: starts the audit's own seeded database, the backend and a built frontend on ports
 * beside the dev stack, runs the audit, and stops what it started.
 *
 * Usage: pnpm a11y:run [audit arguments]   such as `pnpm a11y:run --states sign-in,account`
 *        pnpm a11y:run --keep              leaves the stack up, to rerun `pnpm a11y` against it while fixing
 *        pnpm a11y:run --stop              stops a stack that was kept
 */
const keep = process.argv.includes('--keep');
const auditArgs = process.argv.slice(2).filter((arg) => arg !== '--keep' && arg !== '--stop');

/** The audit stack sits this far above the checkout's dev ports, so it starts beside a running `pnpm dev`. */
const portShift = 70;
const fileEnv = parseEnv(readFileSync(path.join(repoRoot, 'backend/.env'), 'utf8'));
const databasePort = fileEnv.DB_A11Y_PORT ?? '5470';
const compose = ['compose', '-f', 'backend/compose.yaml', '--profile', 'a11y'];

/** The dev database URLs with the audit database's port. */
const databaseUrls = Object.fromEntries(
  ['DATABASE_URL', 'DATABASE_ADMIN_URL', 'DATABASE_CDC_URL'].flatMap((key) => {
    const url = fileEnv[key];
    return url ? [[key, url.replace(/:\d+\//, `:${databasePort}/`)]] : [];
  }),
);
const env = {
  // The seed creates the admin named in backend/.env, so the audit signs in as that user
  ...(fileEnv.ADMIN_EMAIL ? { ADMIN_EMAIL: fileEnv.ADMIN_EMAIL } : {}),
  ...process.env,
  ...databaseUrls,
  DEV_PORT_OFFSET: String(appConfig.devPortOffset + portShift),
  // The system pages need system admin access from this machine
  SYSTEM_ADMIN_IP_ALLOWLIST: '*',
};
const shifted = (url: string) => {
  const next = new URL(url);
  next.port = String(Number(next.port) + portShift);
  return next.toString().replace(/\/$/, '');
};
const frontendUrl = shifted(appConfig.frontendUrl);
const backendUrl = shifted(appConfig.backendUrl);

const run = (command: string, args: string[]) => spawnSync(command, args, { cwd: repoRoot, env, stdio: 'inherit' }).status === 0;
const reachable = (url: string) =>
  fetch(url).then(
    (response) => response.status < 500,
    () => false,
  );

let stack: ChildProcess | null = null;
const stop = () => {
  // The stack runs in its own process group: backend, workers and the frontend server go down together
  if (stack?.pid) {
    try {
      process.kill(-stack.pid, 'SIGTERM');
    } catch {
      // It already exited
    }
  }
  run('docker', [...compose, 'stop', 'db_a11y']);
};

if (process.argv.includes('--stop')) {
  // A kept stack has no parent left to signal: its servers are found by the ports they listen on, and each takes its
  // process group down with it, the file watchers that would restart it included
  const groups = new Set<number>();
  for (const port of Object.values(appConfig.devPorts)) {
    const listeners = spawnSync('lsof', ['-ti', `tcp:${port + portShift}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
      .stdout.split('\n')
      .filter(Boolean);
    for (const pid of listeners) groups.add(Number(spawnSync('ps', ['-o', 'pgid=', '-p', pid], { encoding: 'utf8' }).stdout.trim()));
  }
  for (const group of groups) if (group > 1) process.kill(-group, 'SIGTERM');
  stop();
  process.exit(0);
}

try {
  console.info(`Audit stack: ${frontendUrl} on database port ${databasePort}.`);
  if (!run('docker', [...compose, 'up', '-d', '--wait', 'db_a11y'])) throw new Error('The audit database did not start. Is Docker running?');

  // An empty volume gets the schema and the seed data once; later runs reuse it
  const users = spawnSync('docker', ['exec', `${fileEnv.PROJECT_SLUG}_db_a11y`, 'psql', '-U', 'postgres', '-tAc', 'select count(*) from users'], {
    encoding: 'utf8',
  });
  if (users.status !== 0 || Number(users.stdout.trim()) === 0) {
    console.info('Seeding the audit database (first run only).');
    if (!run('pnpm', ['seed'])) throw new Error('Seeding the audit database failed.');
  }

  if (await reachable(frontendUrl))
    throw new Error(`Something already answers at ${frontendUrl}. Stop it, or run \`DEV_PORT_OFFSET=${env.DEV_PORT_OFFSET} pnpm a11y\` against it.`);
  // `pnpm offline` starts no Yjs relay; with it the editors show their usual sync status
  const relay = appConfig.services.yjs.enabled ? 'pnpm --filter yjs-worker dev & ' : '';
  stack = spawn('sh', ['-c', `${relay}pnpm offline`], { cwd: repoRoot, env, detached: true, stdio: ['ignore', 'ignore', 'inherit'] });

  const deadline = Date.now() + 5 * 60_000;
  while (!((await reachable(frontendUrl)) && (await reachable(`${backendUrl}/health`)))) {
    if (stack.exitCode !== null) throw new Error('The stack stopped while starting: run `pnpm offline` to see why.');
    if (Date.now() > deadline) throw new Error(`The stack did not answer at ${frontendUrl} within five minutes.`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  const passed = run('pnpm', ['a11y', ...auditArgs]);
  if (keep)
    console.info(
      `\nThe stack stays up. Rerun with: DEV_PORT_OFFSET=${env.DEV_PORT_OFFSET} pnpm a11y --states <ids>\nStop it with: pnpm a11y:run --stop`,
    );
  process.exitCode = passed ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (!keep) stop();
  // A kept stack must outlive this process
  else stack?.unref();
}
