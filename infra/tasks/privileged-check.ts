import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appliedDescriptionVariable, followsReleases } from '../lib/deploy/release-gate';
import { owedWork, owedWorkLines, type PrivilegedFootprint } from '../lib/stack/privileged-footprint';
import { environments } from '../lib/stack/project-per-mode';
import { isRecord } from '../lib/utils/guards';
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

/** The repository's variables, as the workflow passes them in `REPOSITORY_VARIABLES` (`toJSON(vars)`). */
function repositoryVariables(): Record<string, unknown> {
  const parsed: unknown = JSON.parse(process.env.REPOSITORY_VARIABLES || '{}');
  return isRecord(parsed) ? parsed : {};
}

/** Whether the environment takes the release once merged, as a summary line: the release's description against the one last applied. */
function releaseLine(mode: string, head: string | undefined, applied: unknown): { line: string; deploys: boolean } {
  if (applied === head) return { deploys: true, line: `**${mode} takes this release:** it describes the app as the last apply did.` };
  const why =
    typeof applied === 'string'
      ? `it describes the app as ${head?.slice(0, 12)} and the last apply as ${applied.slice(0, 12)}, so its deploy would stop at apply needed`
      : 'GitHub holds no description from its last apply';
  const apply = `\`pnpm infra apply --mode ${mode}\` from main or this branch publishes its description and runs this check again`;
  return { deploys: false, line: `**${mode} cannot take this release yet:** ${why}. ${apply}.` };
}

/**
 * The pull request check that needs no key: render, for every environment with a stack file, what the base and the head declare that only
 * an Owner moment or an apply writes, and say what merging owes. It passes either way, as owing an apply is no fault; a head that does not
 * render fails it. With `--release`, on the release PR, it also fails when an environment that follows the releases would stop at apply
 * needed: the release describes the app otherwise than the hash its last apply published to the repository's variables. `--base` is a
 * checkout of the base commit with its workspace installed.
 */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const baseRoot = getFlag(argv, '--base');
  if (!baseRoot) throw new Error('Usage: privileged-check.ts --base <checkout of the base commit> [--release]');
  const variables = argv.includes('--release') ? repositoryVariables() : undefined;
  const baseInfra = join(baseRoot, 'infra');
  const work = mkdtempSync(join(tmpdir(), 'privileged-check-'));
  const modes = environments.filter((mode) => existsSync(join(infraDir, `Pulumi.${mode}.yaml`)));
  const lines: string[] = ['### Privileged changes', ''];
  let owes = false;
  let uncompared = false;
  const releaseLines: string[] = [];
  let blocked = false;
  for (const mode of modes) {
    const head = render(infraDir, mode, join(work, `head-${mode}.json`));
    if (variables && followsReleases(mode)) {
      const release = releaseLine(mode, head.description, variables[appliedDescriptionVariable(mode)]);
      releaseLines.push(release.line, '');
      if (!release.deploys) {
        blocked = true;
        if (process.env.GITHUB_ACTIONS) console.info(`::error title=Release owes an apply::${release.line.replaceAll('*', '')}`);
      }
    }
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
  lines.push(...releaseLines);
  if (!owes && !uncompared && !blocked) lines.push('A deploy can take this change as it is.');
  const text = `${lines.join('\n')}\n`;
  process.stdout.write(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  if (blocked) process.exitCode = 1;
}

runIfMain(import.meta.url, main);
