import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Architecture guard: the raw permission engine (`getAllDecisions`) must be reached ONLY through
 * the actor-guarded wrapper `checkPermission`. `getAllDecisions` takes an options bag with an
 * OPTIONAL actor; `checkPermission` requires an explicit `Actor`. Every call that skips the wrapper
 * is a place an actor can be silently omitted — which fail-closes `'own'` and every row condition,
 * a denial nobody notices. This test makes "only the wrapper touches the engine" a guarantee, not a
 * convention.
 *
 * A Biome `noRestrictedImports` rule was considered but is fragile here: Biome's override cascade
 * would either clobber the existing per-package import rules or also flag test files. A filesystem
 * scan catches barrel AND deep imports and states the rule in one place.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// The one file allowed to call the engine directly: the wrapper itself.
const ALLOWED = path.join(repoRoot, 'shared/src/permissions/check-permission.ts');

const SOURCE_ROOTS = ['shared/src', 'backend/src', 'frontend/src', 'yjs/src', 'cdc/src', 'mcp/src'];

/** Matches an `import { … getAllDecisions … } from '…'` statement (not doc mentions). */
const IMPORTS_ENGINE = /import\s*(?:type\s*)?\{[^}]*\bgetAllDecisions\b[^}]*\}\s*from\s*['"][^'"]+['"]/s;

const walk = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip build output and test-support infrastructure (the latter legitimately drives the engine).
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'testing') continue;
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
};

describe('permission engine boundary', () => {
  it('only check-permission.ts imports getAllDecisions directly', () => {
    const offenders = SOURCE_ROOTS.flatMap((root) => walk(path.join(repoRoot, root)))
      .filter((file) => file !== ALLOWED)
      .filter((file) => IMPORTS_ENGINE.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(repoRoot, file));

    expect(
      offenders,
      'getAllDecisions must be reached only via checkPermission (the actor-guarded wrapper). ' +
        `Offending files:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
