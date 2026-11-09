import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { repositoryUrl } from './repository-key';
import { parseLsRemote, type RemoteRef } from './target.ts';

const execFileAsync = promisify(execFile);

/** git's options that send a repository read key with one command, as a header: the key is in no URL, no remote and no file. */
export function gitKeyOptions(key: string | undefined): string[] {
  return key ? ['-c', `http.extraHeader=Authorization: Basic ${Buffer.from(`x-access-token:${key}`).toString('base64')}`] : [];
}

/**
 * Run one git command with the read key as a header and no prompt, without blocking the process: a remote that stalls holds up no other read.
 * @returns its output
 * @throws with git's error output when it fails, or one line when `timeoutMs` passed
 */
export async function git(key: string | undefined, args: string[], opts: { timeoutMs?: number } = {}): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', [...gitKeyOptions(key), ...args], {
      encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
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
