import { existsSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import { config as defaultConfig } from '../../../config/config.default.ts';

/**
 * The scaffolder writes a new app's `config.default.ts` from `config.template.ts`, so the template equals the
 * default except at the leaves below. Scaffolding deletes the template, so apps skip this suite.
 */
const templateUrl = new URL('../../../config/config.template.ts', import.meta.url);

/** Dot paths of every leaf value; an array counts as one leaf. */
const leafPaths = (node: unknown, prefix = ''): string[] =>
  node && typeof node === 'object' && !Array.isArray(node)
    ? Object.entries(node).flatMap(([key, value]) => leafPaths(value, prefix ? `${prefix}.${key}` : key))
    : [prefix];

const valueAt = (node: unknown, path: string) =>
  path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], node);

/** Leaves a new app sets itself; a trailing dot covers a whole group. */
const intendedDifferences = [
  // Identity: names, URLs, mail addresses, public keys, bucket location, company details.
  'name',
  'slug',
  'domain',
  'description',
  'frontendUrl',
  'backendUrl',
  'backendAuthUrl',
  'yjsUrl',
  'mcpUrl',
  'oauthUrl',
  'statusUrl',
  'productionUrl',
  'senderEmail',
  'supportEmail',
  'securityEmail',
  'gleapToken',
  'googleMapsKey',
  'maplePublicIngestKey',
  's3.region',
  's3.host',
  'company.',
  // Fresh-app starting values: yjs and uploads off until the app provisions them, cache versions at v1.
  'services.yjs.enabled',
  'has.uploadEnabled',
  'cookieVersion',
  'clientCacheVersion',
];

const isIntended = (path: string) =>
  intendedDifferences.some((entry) => (entry.endsWith('.') ? path.startsWith(entry) : path === entry));

const loadTemplate = async (): Promise<unknown> => (await import(templateUrl.href)).config;

describe.skipIf(!existsSync(templateUrl))('config template', () => {
  it('has the same key paths as the default config', async () => {
    expect(leafPaths(await loadTemplate()).sort()).toEqual(leafPaths(defaultConfig).sort());
  });

  it('equals the default config at every other leaf', async () => {
    const template = await loadTemplate();
    const drifted = leafPaths(defaultConfig).filter(
      (path) => !isIntended(path) && !isDeepStrictEqual(valueAt(template, path), valueAt(defaultConfig, path)),
    );
    expect(drifted).toEqual([]);
  });
});
