import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot, withRestoredPaths } from './repo-files.ts';

const configDir = join(repoRoot, 'shared/config');
const swappedPath = 'shared/config';

/** Edited alike, so the test that holds the scaffolder's template to the default config still compares like with like. */
const configFiles = ['config.default.ts', 'config.template.ts'];

/** What an app's config has and the template's does not, as edits of the template's own lines. */
const edits: { files: string[]; from: string; to: string }[] = [
  {
    files: configFiles,
    from: 'surfaces: {} as',
    to: "surfaces: { 'organization.tabs': ['members', 'settings'], 'user.profile': ['organizations'] } as",
  },
  { files: configFiles, from: 'commentEmail: false as boolean', to: 'commentEmail: true as boolean' },
  // An app without a federation runs without the sso strategy; the template keeps it on.
  {
    files: ['config.default.ts'],
    from: "enabledAuthStrategies: ['passkey', 'oauth', 'totp', 'magic', 'sso'] as const",
    to: "enabledAuthStrategies: ['passkey', 'oauth', 'totp', 'magic'] as const",
  },
  {
    files: ['permissions-config.ts'],
    from: "channels.organization.member({ create: 1, read: 1, update: 'own', delete: 'own' });",
    to: 'channels.organization.member({ create: 1, read: 1, update: 0, delete: 0 });',
  },
];

if (!existsSync(join(configDir, 'config.template.ts'))) {
  console.info('No shared/config/config.template.ts: this app runs its suites with its own config.');
  process.exit(0);
}

let suiteFailed = false;
withRestoredPaths([swappedPath], () => {
  for (const { files, from, to } of edits) {
    for (const file of files) {
      const path = join(configDir, file);
      const source = readFileSync(path, 'utf8');
      if (!source.includes(from)) throw new Error(`${file} no longer holds \`${from}\`: adjust ${import.meta.filename}.`);
      writeFileSync(path, source.replace(from, to));
    }
  }
  execFileSync('pnpm', ['docker:test'], { cwd: repoRoot, stdio: 'inherit' });
  try {
    execFileSync('pnpm', ['exec', 'cross-env', 'TEST_MODE=core', 'vitest', 'run', '--silent=passed-only'], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  } catch {
    // The run has printed its failures.
    suiteFailed = true;
  }
});

if (suiteFailed) {
  console.error('\nA suite passes on the template config and fails on an app-shaped one: see the output above. Usual cause: a');
  console.error('test that reads `appConfig` or the policy matrix and assumes the value the template ships. State the value');
  console.error('the test needs (`assumeNoSurfaces`, `assumeMemberAttachmentPolicy`, a `beforeEach` that sets the flag).');
  process.exit(1);
}
console.info('\nThe core suites pass with an app-shaped config.');
