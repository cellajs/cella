import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listRemoteRefs } from '../lib/deploy/git-remote';
import { repositoryUrl } from '../lib/deploy/repository-key';
import { ENVIRONMENTS_FILE, parseEnvironmentsFile, resolveTarget } from '../lib/deploy/target';
import { runIfMain } from '../lib/utils/is-main';
import { infraDir } from '../lib/utils/paths';
import { getFlag } from './args';

/**
 * Print an environment's target as `key=value` lines (GitHub's output format): `target_sha`, `retry`, `target_source`, and one line for the
 * log on stderr. The environments file is read from this checkout; the refs from the repository, with `git ls-remote`, which needs no key
 * for a public repository and `REPOSITORY_READ_KEY` for a private one (D19). `--started-on <sha>` is the commit a manual run was started on,
 * deployed when the environment has no line.
 */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const environment = getFlag(argv, '--mode');
  if (!environment) throw new Error('Usage: target.ts --mode <environment> [--started-on <sha>] [--file <environments file>] [--repo <url>]');
  const file = getFlag(argv, '--file') ?? join(infraDir, '..', ENVIRONMENTS_FILE);
  const repo = getFlag(argv, '--repo') ?? repositoryUrl();
  const lines = existsSync(file) ? parseEnvironmentsFile(readFileSync(file, 'utf8')) : new Map();
  const target = await resolveTarget({
    environment,
    line: lines.get(environment),
    startedOn: getFlag(argv, '--started-on'),
    listRemote: listRemoteRefs(repo, process.env.REPOSITORY_READ_KEY),
  });
  process.stdout.write(`target_sha=${target.sha}\nretry=${target.retry}\ntarget_source=${target.source}\n`);
  console.error(`${environment} deploys ${target.sha} (${target.source}, retry ${target.retry})`);
}

runIfMain(import.meta.url, main);
