import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { config as defaultConfig } from '../../../config/config.default.ts';

/**
 * The scaffolder writes a new app's `config.default.ts` from `config.template.ts`, so the template keeps the
 * default's shape: identity values (names, URLs, keys, company details) differ, key paths and lists do not.
 * Scaffolding deletes the template, so apps skip this suite.
 */
const templateUrl = new URL('../../../config/config.template.ts', import.meta.url);

/** Dot paths of every leaf value; an array counts as one leaf. */
const leafPaths = (node: unknown, prefix = ''): string[] =>
  node && typeof node === 'object' && !Array.isArray(node)
    ? Object.entries(node).flatMap(([key, value]) => leafPaths(value, prefix ? `${prefix}.${key}` : key))
    : [prefix];

const valueAt = (node: unknown, path: string) =>
  path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], node);

const loadTemplate = async (): Promise<unknown> => (await import(templateUrl.href)).config;

describe.skipIf(!existsSync(templateUrl))('config template', () => {
  it('has the same key paths as the default config', async () => {
    expect(leafPaths(await loadTemplate()).sort()).toEqual(leafPaths(defaultConfig).sort());
  });

  it('lists the same values as the default config in every array', async () => {
    const template = await loadTemplate();
    const arrayPaths = leafPaths(defaultConfig).filter((path) => Array.isArray(valueAt(defaultConfig, path)));
    for (const path of arrayPaths) expect(valueAt(template, path), path).toEqual(valueAt(defaultConfig, path));
  });
});
