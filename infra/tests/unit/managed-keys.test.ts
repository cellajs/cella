import { describe, expect, it } from 'vitest';
import { defineManagedKeys, managedKeyById, managedKeys } from '../../lib/managed-keys';
import { runtimeSecrets } from '../../lib/runtime-secrets';

// The config module and lib/managed-keys form an import cycle (config imports the
// define helper, lib derives the registry from config), so the cycle must be entered
// from the lib side. A static import sorts alphabetically ahead of the lib imports.
const { managedKeysConfig } = await import('../../config/managed-keys.config');

describe('managed key registry', () => {
  it('derives managedKeys from the app config, keyed by id, preserving order', () => {
    expect(managedKeys.map((key) => key.id)).toEqual(Object.keys(managedKeysConfig));
    for (const key of managedKeys) {
      const { id, ...rest } = key;
      expect(rest).toEqual(managedKeysConfig[id as keyof typeof managedKeysConfig]);
    }
  });

  it('uses unique suffixes', () => {
    const suffixes = new Set<string>();
    for (const key of managedKeys) {
      expect(suffixes.has(key.suffix), `duplicate managed key suffix: ${key.suffix}`).toBe(false);
      suffixes.add(key.suffix);
    }
  });

  it('grants at least one permission set per key', () => {
    for (const key of managedKeys) {
      expect(key.permissionSets.length, `${key.id} must grant a permission set`).toBeGreaterThan(0);
    }
  });

  it('assigns every minted half to a distinct operator-managed runtime secret', () => {
    const operatorSecretIds = new Set(
      runtimeSecrets.filter((secret) => secret.valueSource === 'operator').map((secret) => secret.id),
    );
    const usedSecretIds = new Set<string>();
    for (const key of managedKeys) {
      const entries = Object.entries(key.assign);
      expect(entries.length, `${key.id} must assign at least one half`).toBeGreaterThan(0);
      for (const [field, secretId] of entries) {
        expect(
          operatorSecretIds.has(secretId),
          `${key.id}.${field} → ${secretId} must be an operator runtime secret`,
        ).toBe(true);
        expect(usedSecretIds.has(secretId), `runtime secret ${secretId} assigned by more than one managed key`).toBe(
          false,
        );
        usedSecretIds.add(secretId);
      }
    }
  });

  it('wires the AI key to a single bearer secret; the s3 key is retired (REQ-20)', () => {
    expect(managedKeyById('ai')?.assign).toEqual({ secretKey: 'scwAiApiKey' });
    // The backend signs S3 requests with its own per-deploy service key now.
    expect(managedKeyById('s3')).toBeUndefined();
  });

  it('defineManagedKeys is a typed identity that preserves the app config', () => {
    const config = defineManagedKeys({
      example: {
        suffix: 'example',
        label: 'Example',
        appDescription: 'app',
        policyDescription: 'policy',
        permissionSets: ['ObjectStorageFullAccess'],
        prompt: { message: 'mint?', default: false },
        assign: { secretKey: 'scwAiApiKey' },
      },
    });
    expect(config.example.suffix).toBe('example');
  });
});
