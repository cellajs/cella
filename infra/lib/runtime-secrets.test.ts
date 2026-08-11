import { describe, expect, it } from 'vitest';
import { databaseUrl } from '../resources/stores/database-url';
import { none } from '../resources/stores/none';
import { buildRuntimeSecrets, type RuntimeSecretDefinition, validateRuntimeSecrets } from './runtime-secrets';
import { readStoreOutput, type StoreOutputs } from './stores';

/** A minimal non-cella app config, the P2 external-store consumer shape. */
const appSecrets: Record<string, Omit<RuntimeSecretDefinition, 'id'>> = {
  adminEmail: {
    secretName: 'admin-email',
    description: 'Admin login',
    envVar: 'ADMIN_EMAIL',
    required: true,
    valueSource: 'operator',
    generation: 'manual',
    services: ['api'],
  },
};
const knownServices: ReadonlySet<string> = new Set(['api', 'worker']);

describe('buildRuntimeSecrets with external stores (P2)', () => {
  it('a databaseUrl registry contributes its operator secret ahead of app entries', () => {
    const secrets = buildRuntimeSecrets({ primary: databaseUrl({ services: ['api'] }) }, appSecrets);
    expect(secrets.map((secret) => secret.id)).toEqual(['databaseUrl', 'adminEmail']);
    expect(secrets[0]).toMatchObject({ envVar: 'DATABASE_URL', valueSource: 'operator', generation: 'manual' });
    expect(() => validateRuntimeSecrets(secrets, knownServices)).not.toThrow();
  });

  it('a none registry yields only the app entries', () => {
    const secrets = buildRuntimeSecrets({ primary: none() }, appSecrets);
    expect(secrets.map((secret) => secret.id)).toEqual(['adminEmail']);
    expect(() => validateRuntimeSecrets(secrets, knownServices)).not.toThrow();
  });

  it('rejects a store contribution clashing with an app-config id', () => {
    const clashing = {
      ...appSecrets,
      databaseUrl: { ...appSecrets.adminEmail!, secretName: 'db-url-2', envVar: 'DB_URL_2' },
    };
    const secrets = buildRuntimeSecrets({ primary: databaseUrl({ services: ['api'] }) }, clashing);
    expect(() => validateRuntimeSecrets(secrets, knownServices)).toThrow(/duplicate secret id 'databaseUrl'/);
  });

  it('rejects a contribution targeting an unknown service', () => {
    const secrets = buildRuntimeSecrets({ primary: databaseUrl({ services: ['nope'] }) }, {});
    expect(() => validateRuntimeSecrets(secrets, knownServices)).toThrow(/unknown service 'nope'/);
  });
});

describe('readStoreOutput (P2 primary-output contract)', () => {
  const output = { fake: true } as unknown as StoreOutputs[string];

  it('a provision-less store yields undefined for every name', () => {
    expect(readStoreOutput({}, 'connectionStringAdmin')).toBeUndefined();
  });

  it('a provisioning store returns its outputs and throws on a missing name', () => {
    expect(readStoreOutput({ host: output }, 'host')).toBe(output);
    expect(() => readStoreOutput({ host: output }, 'connectionStringAdmin')).toThrow(/did not expose output/);
  });
});
