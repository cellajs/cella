import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { appliedDescriptionVariable, followsReleases } from '../lib/deploy/release-gate';
import { environments, stackFilePath } from '../lib/stack/project-per-mode';
import { isRecord } from '../lib/utils/guards';
import { runIfMain } from '../lib/utils/is-main';
import { infraDir } from '../lib/utils/paths';

/** The repository's variables, as the workflow passes them in `REPOSITORY_VARIABLES` (`toJSON(vars)`). */
function repositoryVariables(): Record<string, unknown> {
  const parsed: unknown = JSON.parse(process.env.REPOSITORY_VARIABLES || '{}');
  return isRecord(parsed) ? parsed : {};
}

/** The hash of this checkout's description of the app for one environment, as its builder reports it, in a process of its own: the config loads per mode. */
function releaseDescription(mode: string): string {
  const run = spawnSync('pnpm', ['--silent', 'exec', 'tsx', join('tasks', 'description-hash.ts'), '--mode', mode], {
    cwd: infraDir,
    encoding: 'utf8',
  });
  if (run.status !== 0) throw new Error(`the description of ${mode} did not render:\n${run.stderr.trim().split('\n').slice(-12).join('\n')}`);
  return run.stdout.trim();
}

/** One environment's line: whether merging deploys it, from the release's description against the one its last apply published. */
function releaseLine(mode: string, release: string, applied: unknown): { line: string; deploys: boolean } {
  if (applied === release) return { deploys: true, line: `**${mode} takes this release:** it describes the app as the last apply did.` };
  const state =
    typeof applied === 'string'
      ? `its last apply described the app as ${applied.slice(0, 12)}, and main describes it as ${release.slice(0, 12)} now, which this release carries as it is`
      : 'GitHub holds no description from its last apply';
  return {
    deploys: false,
    line: `**${mode} owes an apply before this release merges:** ${state}. \`pnpm infra apply --mode ${mode}\` from main publishes main's description and runs this check again.`,
  };
}

/**
 * The release PR's check, which needs no key: for every environment that follows the releases, the head's description of the app against
 * the hash that environment's last apply published to the repository's variables. Equal, merging deploys. Otherwise the deploy would end
 * apply needed: the check fails until the apply from main publishes the hash and runs it again (lib/deploy/release-gate.ts).
 */
export async function main(): Promise<void> {
  const variables = repositoryVariables();
  const lines: string[] = ['### Merging this release', ''];
  let owes = false;
  for (const mode of environments.filter((mode) => existsSync(stackFilePath(mode)) && followsReleases(mode))) {
    const { line, deploys } = releaseLine(mode, releaseDescription(mode), variables[appliedDescriptionVariable(mode)]);
    lines.push(line, '');
    if (deploys) continue;
    owes = true;
    if (process.env.GITHUB_ACTIONS) console.info(`::error title=Release owes an apply::${line.replaceAll('*', '')}`);
  }
  if (lines.length === 2) lines.push('No environment follows the releases, so merging deploys nothing.', '');
  const text = `${lines.join('\n')}\n`;
  process.stdout.write(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  if (owes) process.exitCode = 1;
}

runIfMain(import.meta.url, main);
