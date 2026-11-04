import { describe, expect, it } from 'vitest';
import { buildRuntimeSecrets, type RuntimeSecretDefinition, validateRuntimeSecrets } from './runtime-secrets';
import type { StoreSecretContribution } from './stores';

/** A minimal non-cella app config. */
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

/** A store that declares one operator-filled URL for `services`. */
const urlStore = (services: readonly string[]) => ({
  secrets: (): StoreSecretContribution[] => [
    { id: 'queueUrl', secretName: 'queue-url', envVar: 'QUEUE_URL', description: 'Queue URL', required: true, valueSource: 'operator', services },
  ],
});

describe('buildRuntimeSecrets with store contributions', () => {
  it('a store contributes its secret ahead of app entries', () => {
    const secrets = buildRuntimeSecrets({ primary: urlStore(['api']) }, appSecrets);
    expect(secrets.map((secret) => secret.id)).toEqual(['queueUrl', 'adminEmail']);
    expect(secrets[0]).toMatchObject({ envVar: 'QUEUE_URL', valueSource: 'operator', generation: 'manual' });
    expect(() => validateRuntimeSecrets(secrets, knownServices)).not.toThrow();
  });

  it('rejects a store contribution clashing with an app-config id', () => {
    const clashing = { ...appSecrets, queueUrl: { ...appSecrets.adminEmail!, secretName: 'queue-url-2', envVar: 'QUEUE_URL_2' } };
    const secrets = buildRuntimeSecrets({ primary: urlStore(['api']) }, clashing);
    expect(() => validateRuntimeSecrets(secrets, knownServices)).toThrow(/duplicate secret id 'queueUrl'/);
  });

  it('rejects a contribution targeting an unknown service', () => {
    const secrets = buildRuntimeSecrets({ primary: urlStore(['nope']) }, {});
    expect(() => validateRuntimeSecrets(secrets, knownServices)).toThrow(/unknown service 'nope'/);
  });
});

describe('derived runtime secrets', () => {
  const signingKey: Omit<RuntimeSecretDefinition, 'id'> = {
    secretName: 'signing-key',
    description: 'Signing key',
    envVar: 'SIGNING_KEY',
    required: true,
    valueSource: 'engine',
    generation: 'random',
    services: ['api'],
  };
  const derive = (value: string) => `public:${value}`;
  const publicKey = (overrides: Partial<RuntimeSecretDefinition> = {}): Omit<RuntimeSecretDefinition, 'id'> => ({
    secretName: 'public-key',
    description: 'Public key',
    envVar: 'PUBLIC_KEY',
    required: true,
    valueSource: 'engine',
    generation: 'manual',
    services: ['worker'],
    derivedFrom: { secretId: 'signingKey', derive },
    ...overrides,
  });

  it('accepts a pulumi-owned secret derived from a pulumi-owned source (positive control)', () => {
    const secrets = buildRuntimeSecrets({}, { signingKey, publicKey: publicKey() });
    expect(() => validateRuntimeSecrets(secrets, knownServices)).not.toThrow();
  });

  it('must not derive from a source the operator can change out of band, or from an unknown one', () => {
    for (const [label, entries] of [
      ['operator source', { signingKey: { ...signingKey, valueSource: 'operator' as const }, publicKey: publicKey() }],
      ['operator-owned derived value', { signingKey, publicKey: publicKey({ valueSource: 'operator' }) }],
      ['unknown source', { signingKey, publicKey: publicKey({ derivedFrom: { secretId: 'missing', derive } }) }],
    ] as const) {
      const secrets = buildRuntimeSecrets({}, entries);
      expect(() => validateRuntimeSecrets(secrets, knownServices), label).toThrow(/must be pulumi-owned/);
    }
  });
});
