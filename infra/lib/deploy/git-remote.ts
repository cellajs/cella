import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { repositoryUrl } from './repository-key';
import { parseLsRemote, type RemoteRef } from './target.ts';

const execFileAsync = promisify(execFile);

/**
 * The environment that sends a repository read key with one git command, as a header: the key is in no URL, no remote, no file and no
 * argument, which the process list shows to every user of the machine. git reads these variables from 2.31 on.
 */
export function gitKeyEnv(key: string | undefined): Record<string, string> {
  if (!key) return {};
  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.extraHeader',
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`x-access-token:${key}`).toString('base64')}`,
  };
}

/**
 * Run one git command with the read key as a header and no prompt, without blocking the process: a remote that stalls holds up no other read.
 * @returns its output
 * @throws with git's error output when it fails, or one line when `timeoutMs` passed
 */
export async function git(key: string | undefined, args: string[], opts: { timeoutMs?: number } = {}): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...gitKeyEnv(key) },
      timeout: opts.timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    const failed = error as { killed?: boolean; signal?: string | null; stderr?: string };
    if (failed.killed || failed.signal) throw new Error(`git ${args.join(' ')} gave no answer within ${opts.timeoutMs} ms`);
    throw new Error(`git ${args.join(' ')} failed: ${(failed.stderr ?? '').trim()}`);
  }
}

/**
 * The repository's refs matching `patterns`, with `git ls-remote` and the read key when there is one: how a target is found. `timeoutMs`
 * ends a remote that does not answer.
 */
export function listRemoteRefs(repository: string, key: string | undefined, opts: { timeoutMs?: number } = {}) {
  return async (patterns: string[]): Promise<RemoteRef[]> => parseLsRemote(await git(key, ['ls-remote', repository, ...patterns], opts));
}

/**
 * Fetch the head of the repository's default branch into `dir`, an empty folder, as a partial clone under `fetchArgs`; a private
 * repository's read key goes as a header with every fetch.
 * @returns the head's commit id
 * @throws when the repository names no default branch or a git command fails.
 */
export async function fetchDefaultHead(opts: { repository: string; key: string | undefined; dir: string }, fetchArgs: string[]): Promise<string> {
  const head = (await listRemoteRefs(opts.repository, opts.key)(['HEAD'])).find((ref) => ref.ref === 'HEAD')?.sha;
  if (!head) throw new Error(`${opts.repository} names no default branch`);
  await git(opts.key, ['init', '-q', '--bare', opts.dir]);
  await git(opts.key, ['-C', opts.dir, 'remote', 'add', 'origin', opts.repository]);
  await git(opts.key, ['-C', opts.dir, 'config', 'extensions.partialClone', 'origin']);
  await git(opts.key, ['-C', opts.dir, 'config', 'remote.origin.promisor', 'true']);
  await git(opts.key, ['-C', opts.dir, 'fetch', '-q', ...fetchArgs, 'origin', head]);
  return head;
}

/**
 * Whether the repository's default branch contains a commit. The branch's commits are fetched into `dir`, an empty folder, without trees
 * or file contents. The commit asked about is never fetched: a tag may point at a history of any length.
 * @throws when the repository names no default branch or a git command fails.
 */
export async function defaultBranchContains(opts: { repository: string; key: string | undefined; dir: string; sha: string }): Promise<boolean> {
  const head = await fetchDefaultHead(opts, ['--filter=tree:0']);
  // Read whole: the 16 MB `git` keeps of an answer hold about 400,000 commit ids.
  return (await git(opts.key, ['-C', opts.dir, 'rev-list', head])).split('\n').includes(opts.sha);
}

/** How long a read that only names commits waits for the repository, and how long one answer serves the screens of a run. */
const COMMIT_REFS_TIMEOUT_MS = 4_000;
const COMMIT_REFS_FRESH_MS = 30_000;

let commitRefsRead: { at: number; refs: Promise<RemoteRef[] | undefined> } | undefined;

/**
 * The repository's release tags and branch heads, which name a commit on screen; undefined when the repository is not set, does not answer
 * in time or refuses the read key, as a screen then names commits by their id. One read serves every screen of the next half minute.
 */
export function commitRefs(): Promise<RemoteRef[] | undefined> {
  const now = Date.now();
  if (!commitRefsRead || now - commitRefsRead.at > COMMIT_REFS_FRESH_MS) {
    const refs = Promise.resolve()
      .then(() =>
        listRemoteRefs(repositoryUrl(), process.env.REPOSITORY_READ_KEY, { timeoutMs: COMMIT_REFS_TIMEOUT_MS })(['refs/tags/*', 'refs/heads/*']),
      )
      .catch(() => undefined);
    commitRefsRead = { at: now, refs };
  }
  return commitRefsRead.refs;
}
