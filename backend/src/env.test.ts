import { execFile, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { modeSecretNames } from '#/env-mode-secrets';

const backendDir = fileURLToPath(new URL('..', import.meta.url));

/** Secrets every mode reads, with valid values. */
const common = {
  DATABASE_URL: 'postgres://runtime:secret@localhost:5432/app',
  COOKIE_SECRET: 'test-cookie-secret-for-unit-tests',
  DATA_ENCRYPTION_KEY: 'test-data-encryption-key-minimum-32-chars',
};

/** The mode-bound secrets, each with a valid value. */
const modeBound = {
  CDC_SECRET: 'test-cdc-secret-min16chars',
  YJS_TOKEN_PRIVATE_KEY: 'test-yjs-token-key-material-min-32-chars',
  YJS_RELAY_SECRET: 'test-yjs-relay-secret-min16',
  UNSUBSCRIBE_SECRET: 'test-unsubscribe-secret',
  PII_HASH_SECRET: 'test-pii-hash-secret-min16',
  ADMIN_EMAIL: 'admin@example.com',
};

/**
 * Loads env.ts in a fresh process, as a deployed container does: validation is skipped under Vitest. Every mode-bound
 * secret not given is set empty, which counts as absent and keeps a developer's backend/.env from filling it in.
 */
function loadEnv(vars: Record<string, string>) {
  const absent = Object.fromEntries(modeSecretNames.map((name) => [name, '']));
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', "await import('./src/env.ts')"],
    {
      cwd: backendDir,
      env: { PATH: process.env.PATH ?? '', NODE_ENV: 'test', ...absent, ...vars },
      encoding: 'utf8',
      timeout: 20_000,
    },
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/**
 * A worker VM receives only the secrets its mode reads (infra/config/runtime-secrets.config.ts), and the backend image's
 * env schema must accept exactly that: a schema requiring more fails the worker's boot, and handing the worker more
 * widens who can read the API's keys.
 */
describe('env schema per process mode', () => {
  it('must not require the Yjs signing key, the relay, CDC or unsubscribe secrets to boot the authorization server', () => {
    const { status, output } = loadEnv({ MODE: 'oauth', ...common });
    expect(output).not.toContain('Invalid environment variables');
    expect(status).toBe(0);
  });

  it('must not require the Yjs signing key, the relay or CDC secret to boot the MCP server', () => {
    const { status, output } = loadEnv({
      MODE: 'mcp',
      ...common,
      UNSUBSCRIBE_SECRET: modeBound.UNSUBSCRIBE_SECRET,
      PII_HASH_SECRET: modeBound.PII_HASH_SECRET,
    });
    expect(output).not.toContain('Invalid environment variables');
    expect(status).toBe(0);
  });

  it('must not boot the API without the key that signs Yjs tokens (positive control)', () => {
    const { YJS_TOKEN_PRIVATE_KEY: _, ...withoutSigningKey } = modeBound;
    const refused = loadEnv({ MODE: 'api', ...common, ...withoutSigningKey });
    expect(refused.status).not.toBe(0);
    expect(refused.output).toContain('YJS_TOKEN_PRIVATE_KEY');

    expect(loadEnv({ MODE: 'api', ...common, ...modeBound }).status).toBe(0);
  });
});

const tsx = path.join(backendDir, 'node_modules/.bin/tsx');

// Built at run time: stand-ins for generated secrets.
const strong = () => randomBytes(24).toString('base64url');

/**
 * Loads the real env module in a process of its own, as a service boots: Vitest skips its validation.
 * @returns Whether it loaded, and what it printed.
 */
const boot = async (mode: 'production' | 'development', overrides: Record<string, string>) => {
  // Vitest sets VITEST, and MODE for its own use.
  const { VITEST: _vitest, MODE: _mode, ...inherited } = process.env;
  const env = {
    ...inherited,
    NODE_ENV: mode,
    APP_MODE: mode,
    COOKIE_SECRET: strong(),
    UNSUBSCRIBE_SECRET: strong(),
    ...overrides,
  };
  try {
    const script = "import('./src/env.ts').then(() => console.info('env loaded'))";
    const { stdout } = await promisify(execFile)(tsx, ['-e', script], { cwd: backendDir, env });
    return { loaded: stdout.includes('env loaded'), output: stdout };
  } catch (error) {
    const { stdout = '', stderr = '' } = error as { stdout?: string; stderr?: string };
    return { loaded: false, output: `${stdout}${stderr}` };
  }
};

/**
 * `COOKIE_SECRET` signs every auth cookie and may list several secrets (the first signs, any verifies). A stray comma,
 * a blank or a short entry must stop the boot, never become a signing key; the other secrets that sign or authenticate
 * get the same minimum.
 */
describe('secret env validation', () => {
  it('must not boot with an empty or short cookie secret entry', async () => {
    const refused = await Promise.all(
      [',', ' ', `${strong()},`, `${strong()}, ,${strong()}`, 'short-secret', `${strong()},short-secret`].map(
        (COOKIE_SECRET) => boot('production', { COOKIE_SECRET }),
      ),
    );

    for (const { loaded, output } of refused) {
      expect(loaded).toBe(false);
      expect(output).toContain('COOKIE_SECRET');
    }
  });

  it('must not boot with a short unsubscribe secret', async () => {
    const { loaded, output } = await boot('production', { UNSUBSCRIBE_SECRET: 'short-secret' });

    expect(loaded).toBe(false);
    expect(output).toContain('UNSUBSCRIBE_SECRET');
  });

  it('boots with a rotated cookie secret list, and in development on the example values (positive control)', async () => {
    const [rotated, development, blankInDevelopment] = await Promise.all([
      boot('production', { COOKIE_SECRET: `${strong()},${strong()}` }),
      boot('development', { COOKIE_SECRET: 'cookie_secret', UNSUBSCRIBE_SECRET: 'some_secret_token' }),
      boot('development', { COOKIE_SECRET: 'cookie_secret,' }),
    ]);

    expect(rotated.loaded, rotated.output).toBe(true);
    expect(development.loaded, development.output).toBe(true);
    // An empty entry is refused in every mode.
    expect(blankInDevelopment.loaded).toBe(false);
  });
});
