import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { gitKeyOptions, listRemoteRefs } from '../../lib/deploy/git-remote.ts';
import { findJobDefinition, listJobRuns, startJobRun } from '../../lib/deploy/job-runs.ts';
import { ENVIRONMENTS_FILE, parseEnvironmentsFile, resolveTarget } from '../../lib/deploy/target.ts';
import { type RunnerEnvironment, readRunnerEnvironments } from './config.ts';
import { decide } from './decide.ts';

/**
 * The runner (plan §3.4): once a minute, for every environment on its list, find the target and start a run of the environment's main job
 * when that target has none. It runs on Node alone, from a checkout of a pinned release, with nothing installed: every module it imports
 * names its own imports with their `.ts` extension.
 */

const ROUND_MS = 60_000;

const USAGE = `Usage: node runner/src/main.ts --config <file> [--once] [--dry-run] [--state-dir <dir>]
  --config     JSON: { "environments": [{ environment, projectId, region, definition, repository }] }
  --once       one round, then exit
  --dry-run    decide, start nothing
  --state-dir  where the environments files are fetched (default: the system's temporary folder)
Env: SCW_SECRET_KEY (the runner key), REPOSITORY_READ_KEY (a private repository's read key, optional)`;

/**
 * The environments file at the head of the repository's default branch, or '' when it has none (D22). The head is fetched without its file
 * contents into a folder kept between rounds, and again only when it moved; only this one file's content is then fetched.
 */
function environmentsFileReader(stateDir: string, key: string | undefined) {
  const read = new Map<string, { head: string; text: string }>();
  const git = (args: string[]) => {
    const result = spawnSync('git', [...gitKeyOptions(key), ...args], { encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
    return result.stdout;
  };
  return async (repository: string): Promise<string> => {
    const head = (await listRemoteRefs(repository, key)(['HEAD'])).find((ref) => ref.ref === 'HEAD')?.sha;
    if (!head) throw new Error(`${repository} names no default branch`);
    const known = read.get(repository);
    if (known?.head === head) return known.text;
    const dir = join(stateDir, createHash('sha256').update(repository).digest('hex').slice(0, 16));
    if (!existsSync(dir)) {
      git(['init', '-q', '--bare', dir]);
      git(['-C', dir, 'remote', 'add', 'origin', repository]);
      git(['-C', dir, 'config', 'extensions.partialClone', 'origin']);
      git(['-C', dir, 'config', 'remote.origin.promisor', 'true']);
    }
    git(['-C', dir, 'fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', head]);
    const listed = git(['-C', dir, 'ls-tree', head, ENVIRONMENTS_FILE]).trim();
    const text = listed ? git(['-C', dir, 'cat-file', 'blob', `${head}:${ENVIRONMENTS_FILE}`]) : '';
    read.set(repository, { head, text });
    return text;
  };
}

/** One round for one environment: its target, its runs, and a start when the target has none. Returns the line that says what it found. */
async function serve(
  entry: RunnerEnvironment,
  opts: { secretKey: string; readKey: string | undefined; environmentsFile: (repository: string) => Promise<string>; dryRun: boolean },
): Promise<string> {
  const auth = { secretKey: opts.secretKey };
  const line = parseEnvironmentsFile(await opts.environmentsFile(entry.repository)).get(entry.environment);
  const target = await resolveTarget({ environment: entry.environment, line, listRemote: listRemoteRefs(entry.repository, opts.readKey) });
  const what = `${target.sha.slice(0, 10)} (${target.source}, retry ${target.retry})`;
  const definitionId = await findJobDefinition(auth, { region: entry.region, projectId: entry.projectId, name: entry.definition });
  if (!definitionId) return `${what}: no job definition ${entry.definition}; an apply makes it`;
  const runs = await listJobRuns(auth, { region: entry.region, projectId: entry.projectId, definitionId });
  const decision = decide(target, runs);
  if (decision.action === 'wait') return `${what}: waits for run ${decision.run.id} (${decision.run.state})`;
  if (decision.action === 'none') {
    const { state, exit_code: code } = decision.run;
    return `${what}: has run ${decision.run.id}, ${state}${code ? ` (exit ${code})` : ''}`;
  }
  if (opts.dryRun) return `${what}: would start a run`;
  const run = await startJobRun(auth, { region: entry.region, definitionId, values: { TARGET_SHA: target.sha, RETRY: String(target.retry) } });
  return `${what}: started run ${run.id}`;
}

async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      config: { type: 'string' },
      once: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      'state-dir': { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.info(USAGE);
    return 0;
  }
  const secretKey = process.env.SCW_SECRET_KEY;
  if (!values.config || !secretKey) {
    console.error(USAGE);
    return 1;
  }
  const environments = readRunnerEnvironments((JSON.parse(readFileSync(values.config, 'utf8')) as { environments?: unknown }).environments);
  const readKey = process.env.REPOSITORY_READ_KEY || undefined;
  const opts = {
    secretKey,
    readKey,
    environmentsFile: environmentsFileReader(values['state-dir'] ?? join(tmpdir(), 'infra-runner'), readKey),
    dryRun: values['dry-run'],
  };
  console.info(`[runner] ${environments.length} environment(s): ${environments.map((entry) => entry.definition).join(', ')}`);
  // A line is printed when it differs from the round before, so the log holds what changed.
  const said = new Map<string, string>();
  for (;;) {
    for (const entry of environments) {
      const line = await serve(entry, opts).catch((error: unknown) => `failed: ${error instanceof Error ? error.message : String(error)}`);
      if (said.get(entry.definition) !== line) console.info(`[runner] ${entry.environment}: ${line}`);
      said.set(entry.definition, line);
    }
    if (values.once) return 0;
    await new Promise((resolve) => setTimeout(resolve, ROUND_MS));
  }
}

if (process.argv[1]?.endsWith('runner/src/main.ts')) process.exit(await main(process.argv.slice(2)));
