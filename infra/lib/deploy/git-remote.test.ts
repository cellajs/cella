import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { defaultBranchContains } from './git-remote';

const work = mkdtempSync(join(tmpdir(), 'git-remote-test-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** Run git in the repository under test, as an author a fresh runner lacks. */
function gitIn(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, '-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], { encoding: 'utf8' }).trim();
}

/** A repository whose default branch holds two commits, with a third on a side branch that only a release tag names. */
function repositoryWithStrayRelease() {
  const repository = join(work, 'origin');
  execFileSync('git', ['init', '-q', '-b', 'main', repository]);
  // What a host answers: a partial fetch, and a fetch of a commit by its id.
  gitIn(repository, 'config', 'uploadpack.allowFilter', 'true');
  gitIn(repository, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  gitIn(repository, 'commit', '-q', '--allow-empty', '-m', 'first');
  const earlier = gitIn(repository, 'rev-parse', 'HEAD');
  gitIn(repository, 'commit', '-q', '--allow-empty', '-m', 'second');
  const head = gitIn(repository, 'rev-parse', 'HEAD');
  gitIn(repository, 'checkout', '-q', '-b', 'side');
  gitIn(repository, 'commit', '-q', '--allow-empty', '-m', 'never merged');
  const stray = gitIn(repository, 'rev-parse', 'HEAD');
  gitIn(repository, 'tag', '99.0.0');
  gitIn(repository, 'checkout', '-q', 'main');
  return { repository, earlier, head, stray };
}

describe('defaultBranchContains', () => {
  it('must not count a commit that only a tag names, while the head and an earlier release of the branch count', async () => {
    const { repository, earlier, head, stray } = repositoryWithStrayRelease();
    const ask = (sha: string) => defaultBranchContains({ repository, key: undefined, dir: mkdtempSync(join(work, 'clone-')), sha });
    expect(await ask(stray)).toBe(false);
    expect(await ask(head)).toBe(true);
    expect(await ask(earlier)).toBe(true);
  });
});
