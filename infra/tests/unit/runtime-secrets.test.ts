import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  defineRuntimeSecrets,
  runtimeSecretConsumers,
  runtimeSecrets,
  runtimeSecretsForConsumer,
} from '../../lib/runtime-secrets';

// The config module and lib/runtime-secrets form an import cycle (config imports the
// define helper, lib derives the registry from config), so the cycle must be entered
// from the lib side. A static import sorts alphabetically ahead of the lib import.
const { runtimeSecretsConfig } = await import('../../config/runtime-secrets.config');

const backendEnvSource = readFileSync(resolve(__dirname, '../../../backend/src/env.ts'), 'utf-8');
const cdcEnvSource = readFileSync(resolve(__dirname, '../../../cdc/src/env.ts'), 'utf-8');
const yjsEnvSource = readFileSync(resolve(__dirname, '../../../yjs/src/env.ts'), 'utf-8');
const workerEnvBaseSource = readFileSync(resolve(__dirname, '../../../shared/src/utils/worker-env.ts'), 'utf-8');

// The worker env schemas extend workerEnvBase, so shared declarations (e.g.
// DATABASE_SSL_CA) count as declared for cdc and yjs.
const envSources = {
  backend: backendEnvSource,
  cdc: `${workerEnvBaseSource}\n${cdcEnvSource}`,
  yjs: `${workerEnvBaseSource}\n${yjsEnvSource}`,
} as const;

describe('runtime secret registry', () => {
  it('merges store-owned declarations ahead of app-config entries', () => {
    // The per-consumer union order is genId-fingerprinted: the primary store's
    // DSN/CA declarations must keep their historical lead positions.
    const ids = runtimeSecrets.map((secret) => secret.id);
    expect(ids.slice(0, 4)).toEqual(['databaseUrlRuntime', 'databaseUrlAdmin', 'databaseUrlCdc', 'databaseSslCa']);
    expect(Object.keys(runtimeSecretsConfig)).not.toContain('databaseUrlRuntime');
  });

  it('preserves the historical per-consumer manifest order for the backend VM', () => {
    const backendIds = runtimeSecretsForConsumer('backend').map((secret) => secret.id);
    expect(backendIds.slice(0, 4)).toEqual(['databaseUrlRuntime', 'databaseUrlAdmin', 'databaseSslCa', 'cookieSecret']);
  });

  it('uses unique ids, secret names and env vars', () => {
    const ids = new Set<string>();
    const secretNames = new Set<string>();
    const envVars = new Set<string>();

    for (const secret of runtimeSecrets) {
      expect(ids.has(secret.id), `duplicate runtime secret id: ${secret.id}`).toBe(false);
      expect(secretNames.has(secret.secretName), `duplicate runtime secret name: ${secret.secretName}`).toBe(false);
      expect(envVars.has(secret.envVar), `duplicate runtime env var: ${secret.envVar}`).toBe(false);
      ids.add(secret.id);
      secretNames.add(secret.secretName);
      envVars.add(secret.envVar);
    }
  });

  it('assigns every runtime secret to at least one known consumer VM', () => {
    const knownConsumers = new Set<string>(runtimeSecretConsumers);

    for (const secret of runtimeSecrets) {
      expect(secret.services.length, `${secret.id} must target at least one VM`).toBeGreaterThan(0);
      for (const consumer of secret.services) {
        expect(knownConsumers.has(consumer), `${secret.id} targets unknown VM ${consumer}`).toBe(true);
      }
    }
  });

  it('only allows random generation for pulumi-owned secrets', () => {
    for (const secret of runtimeSecrets) {
      if (secret.generation === 'random') {
        expect(secret.valueSource, `${secret.id} random generation must stay pulumi-owned`).toBe('pulumi');
      }
    }
  });

  it('keeps frontend isolated from backend runtime secrets', () => {
    expect(runtimeSecretsForConsumer('frontend')).toEqual([]);
  });

  it('assigns an exact, minimal runtime secret set per VM consumer', () => {
    expect(runtimeSecretsForConsumer('cdc').map((secret) => secret.envVar)).toEqual([
      'DATABASE_CDC_URL',
      'DATABASE_SSL_CA',
      'CDC_SECRET',
      'MAPLE_SECRET_INGEST_KEY',
    ]);
    expect(runtimeSecretsForConsumer('yjs').map((secret) => secret.envVar)).toEqual([
      'DATABASE_URL',
      'DATABASE_SSL_CA',
      'YJS_SECRET',
      'MAPLE_SECRET_INGEST_KEY',
    ]);
    expect(runtimeSecretsForConsumer('frontend')).toEqual([]);
  });

  it('does not leak service-exclusive secrets across VM boundaries', () => {
    const cdcVars = new Set(runtimeSecretsForConsumer('cdc').map((secret) => secret.envVar));
    const yjsVars = new Set(runtimeSecretsForConsumer('yjs').map((secret) => secret.envVar));
    const backendVars = new Set(runtimeSecretsForConsumer('backend').map((secret) => secret.envVar));

    expect(cdcVars.has('YJS_SECRET')).toBe(false);
    expect(yjsVars.has('CDC_SECRET')).toBe(false);
    expect(backendVars.has('DATABASE_CDC_URL')).toBe(false);
  });
});

describe('runtime secret schema alignment', () => {
  it('maps each backend service secret env var to a declared service env schema', () => {
    for (const secret of runtimeSecrets) {
      for (const service of secret.services) {
        if (service === 'mcp') continue;
        if (!(service in envSources)) continue;
        const source = envSources[service as keyof typeof envSources];
        expect(source, `missing env schema fixture for ${service}`).toBeTruthy();
        expect(
          source,
          `${secret.envVar} must be declared in ${service}/src/env.ts when assigned to ${service}`,
        ).toContain(`${secret.envVar}:`);
      }
    }
  });

  it('documents mcp as a backend-env wrapper instead of requiring a standalone env.ts', () => {
    const aiSecrets = runtimeSecrets.filter((secret) => secret.services.includes('mcp'));
    expect(aiSecrets.length).toBeGreaterThan(0);
    expect(backendEnvSource).toContain('DATABASE_ADMIN_URL:');
    expect(backendEnvSource).toContain('SCW_AI_API_KEY:');
  });
});

describe('runtime secret config seam', () => {
  it('defineRuntimeSecrets is a typed identity that preserves the app config', () => {
    const config = defineRuntimeSecrets({
      example: {
        secretName: 'example-secret',
        description: 'fixture',
        envVar: 'EXAMPLE_SECRET',
        required: false,
        valueSource: 'operator',
        generation: 'manual',
        services: ['backend'],
      },
    });
    expect(config).toEqual({
      example: {
        secretName: 'example-secret',
        description: 'fixture',
        envVar: 'EXAMPLE_SECRET',
        required: false,
        valueSource: 'operator',
        generation: 'manual',
        services: ['backend'],
      },
    });
  });

  it('derives the registry tail from the app config, keyed by id, preserving order', () => {
    const configIds = Object.keys(runtimeSecretsConfig);
    const tail = runtimeSecrets.slice(runtimeSecrets.length - configIds.length);
    expect(tail.map((secret) => secret.id)).toEqual(configIds);
    for (const secret of tail) {
      const { id, ...rest } = secret;
      expect(rest).toEqual(runtimeSecretsConfig[id as keyof typeof runtimeSecretsConfig]);
    }
  });
});
