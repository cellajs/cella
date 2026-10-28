import { type ChildProcess, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseEnv } from 'node:util';
import { repoRoot } from './repo-files.ts';

interface PgClient {
  connect(): Promise<void>;
  query(text: string): Promise<unknown>;
  end(): Promise<void>;
}
const { Client } = createRequire(join(repoRoot, 'backend/package.json'))('pg') as {
  Client: new (config: { connectionString: string }) => PgClient;
};

/** The values every service starts with: the example env, so a developer's own keys and endpoints stay out. */
const exampleEnv = parseEnv(readFileSync(join(repoRoot, 'backend/.env.example'), 'utf8'));
const envFile = join(repoRoot, 'backend/.env');
const dbPort = process.env.DB_TEST_PORT ?? (existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')).DB_TEST_PORT : undefined);
if (!dbPort) {
  console.error('DB_TEST_PORT is required (backend/.env or the environment): the services boot on the test database server.');
  process.exit(1);
}

const database = 'service_boot_check';
const dbUrl = (credentials: string, name = database) => `postgres://${credentials}@127.0.0.1:${dbPort}/${name}`;

// The ports `pnpm dev` would use in this checkout. A bundle cannot tell a worktree apart, so it gets the offset passed.
process.env.NODE_ENV = 'development';
process.env.APP_MODE = 'development';
const { appConfig } = await import('../src/config-builder/app-config.ts');
const ports = appConfig.devPorts;

const serviceEnv: NodeJS.ProcessEnv = {
  ...process.env,
  ...exampleEnv,
  NODE_ENV: 'development',
  APP_MODE: 'development',
  DEV_PORT_OFFSET: String(appConfig.devPortOffset),
  DATABASE_URL: dbUrl('runtime_role:dev_password'),
  DATABASE_ADMIN_URL: dbUrl('postgres:postgres'),
  DATABASE_CDC_URL: dbUrl('admin_role:dev_password'),
  // Production migrates in MODE=migrate before the API starts; so does this check.
  RUN_MIGRATIONS_ON_BOOT: 'false',
  SINGLE_VM: 'false',
  GEOIP_SOURCE_URL: 'off',
  PORT: String(ports.api),
  INTERNAL_PORT: String(ports.internal),
  CDC_HEALTH_PORT: String(ports.cdcHealth),
  YJS_PORT: String(ports.yjs),
  BACKEND_INTERNAL_URL: `http://localhost:${ports.internal}`,
};

/**
 * What each production image holds (the Dockerfile's `backend`, `cdc` and `yjs` stages): `copy` is copied, `link`
 * linked, and the workspace's `dependencies` are linked into its node_modules, as `pnpm install --prod` installs them.
 */
const images = {
  backend: { copy: ['backend/dist', 'backend/package.json'], link: ['backend/drizzle', 'locales', 'json'] },
  cdc: { copy: ['cdc/dist', 'cdc/package.json'], link: [] },
  yjs: { copy: ['yjs/dist', 'yjs/package.json'], link: [] },
};
const stagingRoots: string[] = [];

/** Lays out the image's files in a folder of their own, outside the repo and its node_modules; returns the workspace folder. */
const stage = (workspace: keyof typeof images) => {
  const root = mkdtempSync(join(tmpdir(), `boot-check-${workspace}-`));
  stagingRoots.push(root);
  const place = (path: string, put: (target: string) => void) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    put(join(root, path));
  };
  for (const path of images[workspace].copy) place(path, (target) => cpSync(join(repoRoot, path), target, { recursive: true }));
  for (const path of images[workspace].link) place(path, (target) => symlinkSync(join(repoRoot, path), target));
  const { dependencies = {} } = JSON.parse(readFileSync(join(repoRoot, workspace, 'package.json'), 'utf8'));
  for (const name of Object.keys(dependencies))
    place(`${workspace}/node_modules/${name}`, (target) => symlinkSync(realpathSync(join(repoRoot, workspace, 'node_modules', name)), target));
  return join(root, workspace);
};

/** A service as its image starts it: the Dockerfile's `CMD`, from the workspace folder. */
interface Service {
  name: string;
  cwd: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

const output = new Map<string, string[]>();
const running = new Set<ChildProcess>();

const start = (service: Service) => {
  const lines: string[] = [];
  output.set(service.name, lines);
  // process.execPath: the node binary itself, so a version manager's shim never stands between a signal and the service.
  const child = spawn(process.execPath, service.args, {
    cwd: service.cwd,
    env: { ...serviceEnv, ...service.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const collect = (chunk: Buffer) => lines.push(...chunk.toString().split('\n').filter(Boolean));
  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);
  running.add(child);
  child.on('exit', () => running.delete(child));
  return child;
};

/** Resolves with the exit code, or rejects after `timeoutMs`. */
const exited = (child: ChildProcess, name: string, timeoutMs: number) =>
  new Promise<number | null>((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve(child.exitCode);
    const timer = setTimeout(() => reject(new Error(`${name} did not exit within ${timeoutMs / 1000} s`)), timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });

const run = async (service: Service, timeoutMs: number) => {
  const code = await exited(start(service), service.name, timeoutMs);
  if (code !== 0) throw new Error(`${service.name} exited with code ${code}`);
  console.info(`✓ ${service.name} exited 0`);
};

const healthy = async (child: ChildProcess, name: string, port: number, timeoutMs = 60_000) => {
  const deadline = Date.now() + timeoutMs;
  let last = 'no answer';
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`${name} exited (${child.exitCode ?? child.signalCode}) before /health answered on port ${port}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) });
      if (response.status === 204) {
        console.info(`✓ ${name} /health 204 on port ${port}`);
        return;
      }
      last = `status ${response.status}`;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${name} /health on port ${port} did not answer 204 within ${timeoutMs / 1000} s (${last})`);
};

const stop = async (child: ChildProcess, name: string) => {
  child.kill('SIGTERM');
  const code = await exited(child, name, 20_000);
  if (code !== 0) throw new Error(`${name} exited with code ${code} after SIGTERM`);
  console.info(`✓ ${name} stopped on SIGTERM, exit 0`);
};

const portTaken = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });

/** Drops the scratch database and the CDC worker's replication slot in it, and creates it again when `fresh`. */
const resetDatabase = async (fresh: boolean) => {
  const client = new Client({ connectionString: dbUrl('postgres:postgres', 'postgres') });
  await client.connect().catch((error) => {
    throw new Error(`No test database server on port ${dbPort} (pnpm docker:test starts it): ${error instanceof Error ? error.message : error}`);
  });
  const slots = `FROM pg_replication_slots WHERE database = '${database}'`;
  try {
    // A slot stays active for a moment after its worker is killed.
    for (let attempt = 1; ; attempt++) {
      try {
        await client.query(`SELECT pg_terminate_backend(active_pid) ${slots} AND active`);
        await client.query(`SELECT pg_drop_replication_slot(slot_name) ${slots}`);
        break;
      } catch (error) {
        if (attempt === 10) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    await client.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    if (fresh) await client.query(`CREATE DATABASE ${database}`);
  } finally {
    await client.end();
  }
};

let failure: unknown;
try {
  const bundles = ['backend/dist/main.js', 'backend/dist/seeds-bundle.js', 'cdc/dist/cdc-worker.js', 'yjs/dist/yjs-worker.js'];
  const missing = bundles.filter((file) => !existsSync(join(repoRoot, file)));
  if (missing.length) throw new Error(`Not built: ${missing.join(', ')}. Run \`pnpm build\` first.`);
  const taken: number[] = [];
  for (const port of [ports.api, ports.internal, ports.cdcHealth, ports.yjs]) if (await portTaken(port)) taken.push(port);
  if (taken.length) throw new Error(`Port ${taken.join(', ')} is in use: stop that stack, or set DEV_PORT_OFFSET to move these.`);

  const backend = stage('backend');
  const backendArgs = ['--disable-warning=ExperimentalWarning'];
  const api: Service = { name: 'api', cwd: backend, args: [...backendArgs, 'dist/main.js'] };
  const cdc: Service = { name: 'cdc', cwd: stage('cdc'), args: ['dist/cdc-worker.js'] };
  const yjs: Service = { name: 'yjs', cwd: stage('yjs'), args: ['--no-experimental-webstorage', 'dist/yjs-worker.js'] };

  await resetDatabase(true);
  await run({ ...api, name: 'migrate', env: { MODE: 'migrate' } }, 180_000);

  const apiProcess = start(api);
  await healthy(apiProcess, 'api', ports.api);
  await healthy(apiProcess, 'api internal', ports.internal);
  const cdcProcess = start(cdc);
  await healthy(cdcProcess, 'cdc', ports.cdcHealth);
  const yjsProcess = start(yjs);
  await healthy(yjsProcess, 'yjs', ports.yjs);

  // A service that answers once and then crashes, as one reading a missing module late would, is still caught.
  await new Promise((resolve) => setTimeout(resolve, 3000));
  for (const [child, name] of [
    [apiProcess, 'api'],
    [cdcProcess, 'cdc'],
    [yjsProcess, 'yjs'],
  ] as const)
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`${name} exited (${child.exitCode ?? child.signalCode}) after answering /health`);

  await stop(yjsProcess, 'yjs');
  await stop(cdcProcess, 'cdc');
  await stop(apiProcess, 'api');
  await run({ ...api, name: 'seeds', args: [...backendArgs, 'dist/seeds-bundle.js'] }, 120_000);
} catch (error) {
  failure = error;
} finally {
  for (const child of running) child.kill('SIGKILL');
  for (const root of stagingRoots) rmSync(root, { recursive: true, force: true });
  await resetDatabase(false).catch((error) => console.error(`Could not drop the scratch database ${database}:`, error));
}

if (failure) {
  for (const [name, lines] of output) {
    console.error(`\n--- ${name} (last 80 lines) ---`);
    console.error(lines.slice(-80).join('\n'));
  }
  console.error(`\n✗ ${failure instanceof Error ? failure.message : String(failure)}`);
  process.exit(1);
}
console.info('\nThe built services boot, answer /health and stop cleanly.');
