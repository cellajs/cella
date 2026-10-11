/**
 * Typechecks the repo as a new app has it (`pnpm template:check`): the config the scaffolder writes, which declares no
 * federation and leaves `sso` out, plus a regenerated SDK. `--tests` also runs the sign-in and connections suites.
 * The swapped files are restored at the end; an app has no template and passes without doing anything.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot, withRestoredPaths } from './repo-files.ts';

const configDir = join(repoRoot, 'shared/config');
const templatePath = join(configDir, 'config.template.ts');
/** Restored from git afterwards, so they must be clean before the swap. */
const swappedPaths = ['shared/config', 'sdk/gen'];
/** Ignored by git: the spec the SDK is generated from and the fingerprint that lets a later run skip generating it. */
const specFiles = ['backend/openapi.cache.json', 'backend/openapi.manifest.json'];
const modes = ['development', 'tunnel', 'staging', 'production', 'test'];
const suites = ['tests/sign-in', 'tests/connections.test.ts', 'tests/sso-federation-client.test.ts'];

const run = (command: string, args: string[]) => execFileSync(command, args, { cwd: repoRoot, stdio: 'inherit' });

if (!existsSync(templatePath)) {
  console.info('No shared/config/config.template.ts: this app typechecks with its own config.');
  process.exit(0);
}

let failed = false;
withRestoredPaths(swappedPaths, () => {
  const backupDir = mkdtempSync(join(tmpdir(), 'template-config-'));
  const hadSpecFile = specFiles.map((file) => existsSync(join(repoRoot, file)));
  specFiles.forEach((file, index) => {
    if (hadSpecFile[index]) copyFileSync(join(repoRoot, file), join(backupDir, String(index)));
  });

  try {
    // The scaffolder's two tokens, with values the config builder accepts.
    const template = readFileSync(templatePath, 'utf8')
      .replaceAll('__project_name__', 'Template Check')
      .replaceAll('__project_slug__', 'template-check');
    writeFileSync(join(configDir, 'config.default.ts'), template);

    // The mode configs point the default's federation at its test issuer. A new app's mode configs name none.
    for (const mode of modes) {
      const path = join(configDir, `config.${mode}.ts`);
      const source = readFileSync(path, 'utf8').replace(/\n {2}federations: \{\n[\s\S]*?\n {2}\},?\n/, '\n');
      if (source.includes('federations'))
        throw new Error(`config.${mode}.ts still names a federation after the swap: adjust ${import.meta.filename}.`);
      writeFileSync(path, source);
    }

    // `--force`: the generator's fingerprint covers backend/src only, so a config change alone reuses the cached spec.
    run('pnpm', ['--filter', 'backend', 'generate:openapi', '--force']);
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

if (failed) {
  console.error('\nThe repo does not typecheck or pass as a new app: see the output above. Usual cause: code that reads a');
  console.error('sign-in method or a federation the template config leaves out. Ask `isStrategyEnabled` for a method.');
  process.exit(1);
}
console.info('\nThe repo typechecks as a new app.');
