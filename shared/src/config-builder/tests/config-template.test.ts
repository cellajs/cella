import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderTemplateConfig } from '../../../scripts/write-template-config.ts';

/**
 * The scaffolder writes a new app's `config.default.ts` from `config.template.ts`, which `pnpm template:write` renders
 * from the default config and the template leaves. Scaffolding deletes the template, so apps skip this suite.
 */
const templateUrl = new URL('../../../config/config.template.ts', import.meta.url);
const defaultUrl = new URL('../../../config/config.default.ts', import.meta.url);

describe.skipIf(!existsSync(templateUrl))('config template', () => {
  it('is the default config with the template leaves applied (run `pnpm template:write` after a config change)', () => {
    expect(readFileSync(templateUrl, 'utf8')).toBe(renderTemplateConfig(readFileSync(defaultUrl, 'utf8')));
  });
});

/**
 * `cella/create-cella.json` names every template path create-cella removes, empties, copies or edits in a new app.
 * A rename that leaves a path behind fails here, in the pull request that makes it.
 */
const repoRoot = new URL('../../../../', import.meta.url);
const manifestUrl = new URL('cella/create-cella.json', repoRoot);

describe.skipIf(!existsSync(templateUrl))('create-cella manifest', () => {
  it('names paths the template has', () => {
    const manifest: { remove: string[]; empty: string[]; copy: Record<string, string>; edit: Record<string, string> } = JSON.parse(
      readFileSync(manifestUrl, 'utf8'),
    );
    const paths = [...manifest.remove, ...manifest.empty, ...Object.keys(manifest.copy), ...Object.values(manifest.edit)];
    expect(paths.filter((path) => !existsSync(new URL(path, repoRoot)))).toEqual([]);
  });
});
