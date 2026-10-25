import { spawnSync } from 'node:child_process';
import { parseLsRemote, type RemoteRef } from './target.ts';

/** git's options that send a repository read key with one command, as a header: the key is in no URL, no remote and no file. */
export function gitKeyOptions(key: string | undefined): string[] {
  return key ? ['-c', `http.extraHeader=Authorization: Basic ${Buffer.from(`x-access-token:${key}`).toString('base64')}`] : [];
}

/** The repository's refs matching `patterns`, with `git ls-remote` and the read key when there is one: how a target is found. */
export function listRemoteRefs(repository: string, key: string | undefined) {
  return async (patterns: string[]): Promise<RemoteRef[]> => {
    const listed = spawnSync('git', [...gitKeyOptions(key), 'ls-remote', repository, ...patterns], {
      encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    if (listed.status !== 0) throw new Error(`git ls-remote ${repository} failed: ${listed.stderr.trim()}`);
    return parseLsRemote(listed.stdout);
  };
}
