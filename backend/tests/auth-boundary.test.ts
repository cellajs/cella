import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import '#/modules/auth/auth-module';
import { registeredLinkKinds } from '#/modules/auth/core/tokens/operations/open-link-token';
import { linkTokenKinds } from '#/modules/auth/core/tokens/token-policies';

/**
 * The auth module's boundary: the rest of the app imports it through `core/index.ts`, the core imports no flow, and the
 * token engine has an opener for every link kind. A different authenticator replaces `flows/` under these three rules.
 */

const backendRoot = join(import.meta.dirname, '..');

/** Every source file under `dir`, colocated tests left out. */
const collect = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return collect(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [path] : [];
  });

const authImportsOf = (file: string) => [...readFileSync(file, 'utf8').matchAll(/from '(#\/modules\/auth\/[^']+)'/g)].map((match) => match[1]);

/** The one read of the app's own factors the step-up tiers make: `getStepUpFacts` asks which factors the user holds. */
const heldFactorsRead: Record<string, string[]> = {
  'src/modules/auth/core/sessions/sessions-queries.ts': ['#/modules/auth/flows/mfa/mfa-queries'],
};

describe('auth module boundary', () => {
  const files = [...collect(join(backendRoot, 'src')), ...collect(join(backendRoot, 'emails'))];

  it('the rest of the app imports the module through its index only', () => {
    const offenders = files
      .filter((file) => !file.includes('/src/modules/auth/'))
      .flatMap((file) =>
        authImportsOf(file)
          .filter((path) => path !== '#/modules/auth/core')
          .map((path) => `${relative(backendRoot, file)}: ${path}`),
      );
    expect(offenders).toEqual([]);
  });

  it('the core imports no flow and no account surface, but the one read of held factors', () => {
    const offenders = files
      .filter((file) => file.includes('/src/modules/auth/core/'))
      .flatMap((file) => {
        const name = relative(backendRoot, file);
        return authImportsOf(file)
          .filter(
            (path) =>
              (path.startsWith('#/modules/auth/flows/') || path.startsWith('#/modules/auth/account/')) && !heldFactorsRead[name]?.includes(path),
          )
          .map((path) => `${name}: ${path}`);
      });
    expect(offenders).toEqual([]);
  });

  it('every link kind has an opener once the handlers are loaded', () => {
    expect([...registeredLinkKinds()].sort()).toEqual([...linkTokenKinds].sort());
  });
});
