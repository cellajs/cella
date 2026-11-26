import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
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

/** Every module path a file names: imports, side-effect imports, `import()` and `vi.mock`; a relative one is resolved to its alias form. */
const specifiers = /(?:from\s+|import\s*\(?\s*|vi\.mock\(\s*)['"]([^'"]+)['"]/g;
const authImportsOf = (file: string) =>
  [...readFileSync(file, 'utf8').matchAll(specifiers)]
    .map(([, specifier]) => (specifier.startsWith('.') ? `#/${relative(join(backendRoot, 'src'), resolve(dirname(file), specifier))}` : specifier))
    .filter((path) => path.startsWith('#/modules/auth/'));

/** The one read of the app's own factors the step-up tiers make: `getStepUpFacts` asks which factors the user holds. */
const heldFactorsRead = 'src/modules/auth/core/sessions/sessions-queries.ts: #/modules/auth/flows/mfa/mfa-queries';

/**
 * The one flow the API entry imports: with `lti` on, `main.api.ts` refuses at boot a role map that opens more than the
 * launched channel.
 */
const ltiBootCheck = 'src/main.api.ts: #/modules/auth/flows/lti/operations/admit-lti-person';

describe('auth module boundary', () => {
  const files = [...collect(join(backendRoot, 'src')), ...collect(join(backendRoot, 'emails'))];

  it('the rest of the app imports the module through its index only, but the boot check of the lti role map', () => {
    // The module registry loads every module's definition file; everything else goes through the index.
    const allowed = ['#/modules/auth/core', '#/modules/auth/auth-module'];
    const offenders = files
      .filter((file) => !file.includes('/src/modules/auth/'))
      .flatMap((file) =>
        authImportsOf(file)
          .filter((path) => !allowed.includes(path))
          .map((path) => `${relative(backendRoot, file)}: ${path}`),
      )
      .filter((offender) => offender !== ltiBootCheck);
    expect(offenders).toEqual([]);
  });

  it('the core imports no flow and no account surface, but the one read of held factors', () => {
    const offenders = files
      .filter((file) => file.includes('/src/modules/auth/core/'))
      .flatMap((file) => {
        const name = relative(backendRoot, file);
        return authImportsOf(file)
          .filter((path) => path.startsWith('#/modules/auth/flows/') || path.startsWith('#/modules/auth/account/'))
          .map((path) => `${name}: ${path}`)
          .filter((offender) => offender !== heldFactorsRead);
      });
    expect(offenders).toEqual([]);
  });

  it('every link kind has an opener once the handlers are loaded', () => {
    expect([...registeredLinkKinds()].sort()).toEqual([...linkTokenKinds].sort());
  });
});
