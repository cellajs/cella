import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { owedWork, owedWorkLines, type PrivilegedFootprint } from '../lib/stack/privileged-footprint';
import { environments } from '../lib/stack/project-per-mode';
import { runIfMain } from '../lib/utils/is-main';
import { infraDir } from '../lib/utils/paths';
import { getFlag } from './args';

const RENDER = join('tasks', 'privileged-footprint.ts');

/** Render one environment's footprint in a checkout's `infra/` directory, in a process of its own: the program's modules hold its state. */
function render(dir: string, mode: string, out: string): PrivilegedFootprint {
  const run = spawnSync('pnpm', ['--silent', 'exec', 'tsx', RENDER, '--mode', mode, '--out', out], { cwd: dir, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`the keyless render of ${mode} in ${dir} failed:\n${run.stderr.trim().split('\n').slice(-12).join('\n')}`);
  return JSON.parse(readFileSync(out, 'utf8')) as PrivilegedFootprint;
}

/**
 * The pull request check that needs no key: render, for every environment with a stack file, what the base and the head declare that only
 * an Owner moment or an apply writes, and say what merging owes. It passes either way, as owing an apply is no fault; a head that does not
 * render fails it. `--base` is a checkout of the base commit with its workspace installed.
 */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const baseRoot = getFlag(argv, '--base');
  if (!baseRoot) throw new Error('Usage: privileged-check.ts --base <checkout of the base commit>');
  const baseInfra = join(baseRoot, 'infra');
  const work = mkdtempSync(join(tmpdir(), 'privileged-check-'));
  const modes = environments.filter((mode) => existsSync(join(infraDir, `Pulumi.${mode}.yaml`)));
  const lines: string[] = ['### Privileged changes', ''];
  let owes = false;
  let uncompared = false;
  for (const mode of modes) {
    const head = render(infraDir, mode, join(work, `head-${mode}.json`));
    if (!existsSync(join(baseInfra, RENDER))) {
      lines.push(`**${mode}:** the base cannot render what it declares without a key, so there is nothing to compare with.`, '');
      uncompared = true;
      continue;
    }
    let base: PrivilegedFootprint;
    try {
      base = render(baseInfra, mode, join(work, `base-${mode}.json`));
    } catch (error) {
      lines.push(`**${mode}:** the base did not render, so there is nothing to compare with.`, '');
      console.error(error instanceof Error ? error.message : String(error));
      uncompared = true;
      continue;
    }
    const owed = owedWork(base, head);
    lines.push(...owedWorkLines(owed), '');
    if (owed.ownerMoment.length > 0 || owed.apply.length > 0) {
      owes = true;
      if (process.env.GITHUB_ACTIONS) {
        const what = [owed.ownerMoment.length > 0 ? 'an Owner moment' : '', owed.apply.length > 0 ? 'an apply' : ''].filter(Boolean).join(' and ');
        console.info(`::warning title=Privileged change::${mode} needs ${what} before its next deploy; the job summary lists what changes.`);
      }
    }
  }
  if (!owes && !uncompared) lines.push('A deploy can take this change as it is.');
  const text = `${lines.join('\n')}\n`;
  process.stdout.write(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
}

runIfMain(import.meta.url, main);
