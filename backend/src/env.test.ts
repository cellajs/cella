import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
