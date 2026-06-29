import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { optionalModuleFolders, scanOptionalModules } from '#/utils/scan-optional-modules';

/**
 * Guards the optional-module folder removal in `create.ts`. Deselecting a module deletes its
 * folders with `rm(..., { force: true })`, which silently ignores missing paths. That makes the
 * hardcoded route/static paths fragile: if the template layout changes (a route folder is
 * renamed/moved, or a module relocates), removal would quietly stop working and leave orphaned
 * files in the scaffold. These tests fail loudly when that drift happens.
 *
 * Asserted against the LOCAL repo (this monorepo is the template), so no network/remote drift.
 */
const repoRoot = resolve(import.meta.dirname, '../../..');

describe('optional module removal paths', () => {
  it('discovers the marketing optional module', async () => {
    const modules = await scanOptionalModules(repoRoot);
    expect(modules.map((m) => m.name)).toContain('marketing');
  });

  it('every discovered module has its own folder plus at least one real route/static folder', async () => {
    const modules = await scanOptionalModules(repoRoot);
    expect(modules.length).toBeGreaterThan(0);

    for (const module of modules) {
      const existing = optionalModuleFolders(module).filter((f) => existsSync(join(repoRoot, f)));

      // The module's own folder must exist.
      expect(existsSync(join(repoRoot, module.folder)), `module folder missing: ${module.folder}`).toBe(true);

      // At least one route/static folder beyond the module folder itself must match the layout,
      // otherwise the hardcoded removal paths have drifted and deselecting "${module.name}" would
      // leave orphaned files behind.
      expect(existing.length, `removal paths for "${module.name}" have drifted from the template`).toBeGreaterThan(1);
    }
  });

  it('marketing removal targets its public route and static asset folders', async () => {
    const modules = await scanOptionalModules(repoRoot);
    const marketing = modules.find((m) => m.name === 'marketing');
    expect(marketing).toBeDefined();

    const existing = optionalModuleFolders(marketing!).filter((f) => existsSync(join(repoRoot, f)));
    expect(existing).toEqual(
      expect.arrayContaining([
        'frontend/src/modules/marketing',
        'frontend/src/routes/_public/_marketing',
        'frontend/public/static/marketing',
      ]),
    );
  });
});
