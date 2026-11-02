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
