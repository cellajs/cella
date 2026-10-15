import { describe, expect, it } from 'vitest';
import { parseEnvironmentsFile, parseLsRemote, type RemoteRef, resolveTarget } from './target';

const sha = (digit: string) => digit.repeat(40);
const refs: RemoteRef[] = [
  { sha: sha('a'), ref: 'refs/heads/main' },
  { sha: sha('b'), ref: 'refs/heads/infra-rewrite' },
  { sha: sha('1'), ref: 'refs/tags/0.9.8' },
  { sha: sha('2'), ref: 'refs/tags/0.18.1' },
  { sha: sha('3'), ref: 'refs/tags/0.18.1^{}' },
  { sha: sha('4'), ref: 'refs/tags/create-cella-9.9.9' },
  { sha: sha('5'), ref: 'refs/tags/0.10.0' },
];
const listRemote = async (patterns: string[]) =>
  refs.filter((ref) => patterns.some((pattern) => (pattern.endsWith('*') ? ref.ref.startsWith(pattern.slice(0, -1)) : ref.ref === pattern)));

describe('the environments file', () => {
  it('reads a pin, a branch, the releases and a retry counter, and ignores comments', () => {
    const lines = parseEnvironmentsFile(
      ['# environment  target  [retry <n>]', 'staging branch:infra-rewrite', 'production 0.9.8 retry 2  # rolled back', ''].join('\n'),
    );
    expect(lines.get('staging')).toEqual({ environment: 'staging', rule: { kind: 'branch', branch: 'infra-rewrite' }, retry: 0 });
    expect(lines.get('production')).toEqual({ environment: 'production', rule: { kind: 'pin', ref: '0.9.8' }, retry: 2 });
  });

  it('must not guess: a line it cannot read refuses the whole file', () => {
    expect(() => parseEnvironmentsFile('staging main')).toThrow(/no target/);
    expect(() => parseEnvironmentsFile('staging releases retry two')).toThrow(/whole number/);
    expect(() => parseEnvironmentsFile('staging releases\nstaging branch:main')).toThrow(/has a line already/);
    expect(() => parseEnvironmentsFile('staging releases retry')).toThrow(/expected/);
  });
});

describe('resolveTarget', () => {
  it('follows main for staging and the newest release for production by default', async () => {
    expect(await resolveTarget({ environment: 'staging', listRemote })).toMatchObject({ sha: sha('a'), source: 'branch main', retry: 0 });
    // The newest by version, not by name, and the commit an annotated tag points to; other tags are no releases.
    expect(await resolveTarget({ environment: 'production', listRemote })).toMatchObject({ sha: sha('3'), source: 'release 0.18.1' });
  });

  it('deploys what a line pins, with its retry counter', async () => {
    const lines = parseEnvironmentsFile(`production 0.9.8 retry 1\nstaging ${sha('c')}\npreview branch:infra-rewrite`);
    expect(await resolveTarget({ environment: 'production', line: lines.get('production'), listRemote })).toMatchObject({
      sha: sha('1'),
      retry: 1,
      source: 'pinned release 0.9.8',
    });
    expect(await resolveTarget({ environment: 'staging', line: lines.get('staging'), listRemote })).toMatchObject({ sha: sha('c') });
    expect(await resolveTarget({ environment: 'preview', line: lines.get('preview'), listRemote })).toMatchObject({ sha: sha('b') });
  });

  it('deploys the commit a manual run was started on, unless the environment has a line', async () => {
    const lines = parseEnvironmentsFile('production 0.9.8');
    expect(await resolveTarget({ environment: 'staging', startedOn: sha('d'), listRemote })).toMatchObject({ sha: sha('d') });
    expect(await resolveTarget({ environment: 'production', line: lines.get('production'), startedOn: sha('d'), listRemote })).toMatchObject({
      sha: sha('1'),
    });
  });

  it('says what is missing when a branch or a release is not there', async () => {
    const lines = parseEnvironmentsFile('staging branch:gone\nproduction 1.2.3');
    await expect(resolveTarget({ environment: 'staging', line: lines.get('staging'), listRemote })).rejects.toThrow(/does not have/);
    await expect(resolveTarget({ environment: 'production', line: lines.get('production'), listRemote })).rejects.toThrow(/does not have/);
  });

  it('reads git ls-remote output', () => {
    expect(parseLsRemote(`${sha('a')}\trefs/heads/main\nwarning: noise\n`)).toEqual([{ sha: sha('a'), ref: 'refs/heads/main' }]);
  });
});
