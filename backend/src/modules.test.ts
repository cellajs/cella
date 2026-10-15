import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const modulesDir = new URL('./modules/', import.meta.url);

/** `#/modules/<folder>/<name>-module` for every module definition file under src/modules. */
const moduleSpecifiers = () =>
  readdirSync(modulesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap(({ name: folder }) =>
      readdirSync(new URL(`${folder}/`, modulesDir))
        .filter((file) => file.endsWith('-module.ts'))
        .map((file) => `#/modules/${folder}/${file.slice(0, -'.ts'.length)}`),
    );

describe('backend composition root', () => {
  // A module file modules.ts does not import never registers its routes, jobs or mutation handlers, and nothing fails.
  it('imports every module definition file', () => {
    const compositionRoot = readFileSync(new URL('./modules.ts', import.meta.url), 'utf8');
    const missing = moduleSpecifiers().filter((specifier) => !compositionRoot.includes(`import '${specifier}';`));
    expect(missing).toEqual([]);
  });
});
