import { spawnSync } from 'node:child_process';
import { parseLsRemote, type RemoteRef } from './target.ts';

/** git's options that send a repository read key with one command, as a header: the key is in no URL, no remote and no file. */
export function gitKeyOptions(key: string | undefined): string[] {
  return key ? ['-c', `http.extraHeader=Authorization: Basic ${Buffer.from(`x-access-token:${key}`).toString('base64')}`] : [];
}

/**
 * Run one git command with the read key as a header and no prompt.
 * @returns its output
 * @throws with git's error output when it fails
 */
export function git(key: string | undefined, args: string[]): string {
  const result = spawnSync('git', [...gitKeyOptions(key), ...args], { encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

/** The repository's refs matching `patterns`, with `git ls-remote` and the read key when there is one: how a target is found. */
export function listRemoteRefs(repository: string, key: string | undefined) {
  return async (patterns: string[]): Promise<RemoteRef[]> => parseLsRemote(git(key, ['ls-remote', repository, ...patterns]));
}
