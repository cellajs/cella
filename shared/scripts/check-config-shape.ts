import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../config/config.default.ts';
import { localDatabasePort } from '../src/local-database.ts';
import { applyLeaves, appShapeDefaultOnlyLeaves, appShapeLeaves, appShapePermissionsEdit } from './write-template-config.ts';

const mode = process.argv[2];
if (mode !== 'template' && mode !== 'app') {
  console.error('Usage: check-config-shape.ts <template|app> [--tests]');
  process.exit(1);
}

/** Read before the swap: compose names the test database by slug and binds it by port, so another slug or app number starts a second container. */
const { slug } = config;
const testDatabaseEnv = { ...process.env, DB_TEST_PORT: String(localDatabasePort('test')) };

const repoRoot = join(import.meta.dirname, '..', '..');
const configDir = join(repoRoot, 'shared/config');
const templatePath = join(configDir, 'config.template.ts');

const run = (command: string, args: string[]) => execFileSync(command, args, { cwd: repoRoot, env: testDatabaseEnv, stdio: 'inherit' });

if (!existsSync(templatePath)) {
  console.info('No shared/config/config.template.ts: this app checks with its own config.');
  process.exit(0);
}

let failed = false;

/**
 * Runs `run`, which may rewrite files under `paths`, and restores those paths from git afterwards: also when `run`
 * throws, and when the process is interrupted while a command of `run` is under way. Exits 1 without running when
 * a path holds uncommitted changes, since the restore would discard them.
 */
function withRestoredPaths(paths: string[], run: () => void): void {
  const git = (args: string[]) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (git(['status', '--porcelain', '--', ...paths]).trim()) {
    console.error(`Commit the changes under ${paths.join(' and ')} first: the check restores them from git.`);
    process.exit(1);
  }
  // With a handler set, an interrupt ends the running command and its error reaches the `finally` below.
  const interrupted = () => process.exit(130);
  process.once('SIGINT', interrupted);
  process.once('SIGTERM', interrupted);
  try {
    run();
  } finally {
    git(['checkout', '--', ...paths]);
    process.off('SIGINT', interrupted);
    process.off('SIGTERM', interrupted);
  }
}

/** Typechecks the repo as a new app has it; `--tests` adds the sign-in, connections and SSO federation client suites. */
const checkTemplateShape = () => {
  /** Ignored by git: the spec the SDK is generated from and the fingerprint that lets a later run skip generating it. */
  const specFiles = ['backend/openapi.cache.json', 'backend/openapi.manifest.json'];
  const suites = ['tests/sign-in', 'tests/connections.test.ts', 'tests/sso-federation-client.test.ts'];
  withRestoredPaths(['shared/config', 'sdk/gen'], () => {
    const backupDir = mkdtempSync(join(tmpdir(), 'template-config-'));
    const hadSpecFile = specFiles.map((file) => existsSync(join(repoRoot, file)));
    specFiles.forEach((file, index) => {
      if (hadSpecFile[index]) copyFileSync(join(repoRoot, file), join(backupDir, String(index)));
    });

    try {
      // The scaffolder's two tokens, with values the config builder accepts.
      const template = readFileSync(templatePath, 'utf8').replaceAll('__project_name__', 'Template Check').replaceAll('__project_slug__', slug);
      writeFileSync(join(configDir, 'config.default.ts'), template);

      run('pnpm', ['--filter', 'backend', 'generate:openapi']);
      run('pnpm', ['--filter', 'sdk', 'generate:sdk']);
      run('pnpm', ['ts']);
      if (process.argv.includes('--tests')) {
        run('pnpm', ['docker:test']);
        run('pnpm', ['--filter', 'backend', 'exec', 'cross-env', 'TEST_MODE=core', 'vitest', 'run', ...suites]);
      }
    } catch (error) {
      failed = true;
      // A failed command has printed its own output; anything else is this script's.
      if (!(error instanceof Error && 'status' in error)) console.error(error);
    } finally {
      specFiles.forEach((file, index) => {
        if (hadSpecFile[index]) copyFileSync(join(backupDir, String(index)), join(repoRoot, file));
        else rmSync(join(repoRoot, file), { force: true });
      });
      rmSync(backupDir, { recursive: true, force: true });
    }
  });
};

/** Runs the core suites with both config files edited to an app's shape; a missing leaf throws after the restore. */
const checkAppShape = () => {
  withRestoredPaths(['shared/config'], () => {
    const defaultPath = join(configDir, 'config.default.ts');
    writeFileSync(
      defaultPath,
      applyLeaves(readFileSync(defaultPath, 'utf8'), [...appShapeLeaves, ...appShapeDefaultOnlyLeaves], 'config.default.ts'),
    );
    writeFileSync(templatePath, applyLeaves(readFileSync(templatePath, 'utf8'), appShapeLeaves, 'config.template.ts'));
    const permissionsPath = join(configDir, appShapePermissionsEdit.file);
    const permissions = readFileSync(permissionsPath, 'utf8');
    if (!permissions.includes(appShapePermissionsEdit.from)) {
      throw new Error(`${appShapePermissionsEdit.file} no longer holds \`${appShapePermissionsEdit.from}\`: adjust write-template-config.ts.`);
    }
    writeFileSync(permissionsPath, permissions.replace(appShapePermissionsEdit.from, appShapePermissionsEdit.to));
    run('pnpm', ['docker:test']);
    try {
      run('pnpm', ['exec', 'cross-env', 'TEST_MODE=core', 'vitest', 'run', '--silent=passed-only']);
    } catch {
      // The run has printed its failures.
      failed = true;
    }
  });
};

if (mode === 'template') checkTemplateShape();
else checkAppShape();

if (failed && mode === 'template') {
  console.error('\nThe repo does not typecheck or pass as a new app: see the output above. Usual cause: code that reads a');
  console.error('sign-in method or a federation the template config leaves out. Ask `isStrategyEnabled` for a method.');
  process.exit(1);
}
if (failed) {
  console.error('\nA suite passes on the template config and fails on an app-shaped one: see the output above. Usual cause: a');
  console.error('test that reads `appConfig` or the policy matrix and assumes the value the template ships. State the value');
  console.error('the test needs (`assumeNoSurfaces`, `assumeMemberAttachmentPolicy`, a `beforeEach` that sets the flag).');
  process.exit(1);
}
console.info(mode === 'template' ? '\nThe repo typechecks as a new app.' : '\nThe core suites pass with an app-shaped config.');
