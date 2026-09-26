import { describe, expect, it } from 'vitest';
import { databaseUrl } from '../resources/stores/database-url';
import { none } from '../resources/stores/none';
import { buildRuntimeSecrets, type RuntimeSecretDefinition, validateRuntimeSecrets } from './runtime-secrets';

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

describe('derived runtime secrets', () => {
  const signingKey: Omit<RuntimeSecretDefinition, 'id'> = {
    secretName: 'signing-key',
    description: 'Signing key',
    envVar: 'SIGNING_KEY',
    required: true,
    valueSource: 'pulumi',
    generation: 'random',
    services: ['api'],
  };
  const derive = (value: string) => `public:${value}`;
  const publicKey = (overrides: Partial<RuntimeSecretDefinition> = {}): Omit<RuntimeSecretDefinition, 'id'> => ({
    secretName: 'public-key',
    description: 'Public key',
    envVar: 'PUBLIC_KEY',
    required: true,
    valueSource: 'pulumi',
    generation: 'manual',
    services: ['worker'],
    derivedFrom: { secretId: 'signingKey', derive },
    ...overrides,
  });

  it('accepts a pulumi-owned secret derived from a pulumi-owned source (positive control)', () => {
    const secrets = buildRuntimeSecrets({ primary: none() }, { signingKey, publicKey: publicKey() });
    expect(() => validateRuntimeSecrets(secrets, knownServices)).not.toThrow();
  });

  it('must not derive from a source the operator can change out of band, or from an unknown one', () => {
    for (const [label, entries] of [
      ['operator source', { signingKey: { ...signingKey, valueSource: 'operator' as const }, publicKey: publicKey() }],
      ['operator-owned derived value', { signingKey, publicKey: publicKey({ valueSource: 'operator' }) }],
      ['unknown source', { signingKey, publicKey: publicKey({ derivedFrom: { secretId: 'missing', derive } }) }],
    ] as const) {
      const secrets = buildRuntimeSecrets({ primary: none() }, entries);
      expect(() => validateRuntimeSecrets(secrets, knownServices), label).toThrow(/must be pulumi-owned/);
    }
  });
});
