/**
 * Unit tests for app-module territory resolution.
 *
 * Builds a temporary repo fixture with module files declaring different owners
 * and asserts that only `owner: 'app'` module folders are returned.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveAppModuleFolders } from '../src/utils/module-territory';

let repoPath: string;

/** Write a `*-module.ts` file declaring the given owner. */
function writeModule(scope: 'backend' | 'frontend', name: string, owner: 'app' | 'cella', extra = ''): void {
  const dir = join(repoPath, scope, 'src', 'modules', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${name}-module.ts`),
    `import { registerModule } from 'shared/module-registry';\n\nregisterModule({\n  name: '${name}',\n  owner: '${owner}',\n  scope: 'both',\n  description: 'test',${extra}\n});\n`,
  );
}

beforeEach(() => {
  repoPath = mkdtempSync(join(tmpdir(), 'cella-territory-'));
});

afterEach(() => {
  rmSync(repoPath, { recursive: true, force: true });
});

describe('resolveAppModuleFolders', () => {
  it('returns folders for app-owned modules only', () => {
    writeModule('backend', 'projects', 'app');
    writeModule('backend', 'attachment', 'cella');
    writeModule('frontend', 'projects', 'app');
    writeModule('frontend', 'page', 'cella');

    const folders = resolveAppModuleFolders(repoPath);

    expect(folders.sort()).toEqual(['backend/src/modules/projects', 'frontend/src/modules/projects']);
  });

  it('returns an empty array when no app modules exist', () => {
    writeModule('backend', 'attachment', 'cella');
    writeModule('frontend', 'page', 'cella');

    expect(resolveAppModuleFolders(repoPath)).toEqual([]);
  });

  it('returns an empty array when there are no module files', () => {
    expect(resolveAppModuleFolders(repoPath)).toEqual([]);
  });

  it('is tolerant of formatting, comments, and property order', () => {
    const dir = join(repoPath, 'backend', 'src', 'modules', 'tasks');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'tasks-module.ts'),
      [
        "import { registerModule } from 'shared/module-registry';",
        '',
        '// fork-specific module',
        'registerModule({',
        "  scope: 'both',",
        "  name: 'tasks',",
        "  description: 'multi',",
        "  owner: 'app', // owned by the fork",
        '});',
        '',
      ].join('\n'),
    );

    expect(resolveAppModuleFolders(repoPath)).toEqual(['backend/src/modules/tasks']);
  });
});
