import { describe, expect, it } from 'vitest';
import { parseEnvironmentsFile, parseLsRemote, type RemoteRef, resolveTarget, type Target } from './target';

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

  it('must not let a merged line put production on a commit or a branch: only a release or the releases', () => {
    expect(() => parseEnvironmentsFile(`production ${sha('d')}`)).toThrow(/releases only/);
    expect(() => parseEnvironmentsFile('production branch:main')).toThrow(/releases only/);
    expect(parseEnvironmentsFile('production releases retry 1').get('production')?.rule).toEqual({ kind: 'releases' });
  });
});

describe('resolveTarget', () => {
  it.each<{ file: string; environment: string; deploys?: Pick<Target, 'sha' | 'source' | 'retry'> }>([
    // The newest by version, not by name, and the commit an annotated tag points to; other tags are no releases.
    { file: '', environment: 'production', deploys: { sha: sha('3'), source: 'release 0.18.1', retry: 0 } },
    { file: 'production 0.9.8 retry 1', environment: 'production', deploys: { sha: sha('1'), source: 'pinned release 0.9.8', retry: 1 } },
    { file: '', environment: 'staging' },
    { file: 'preview branch:main', environment: 'staging' },
    { file: 'staging branch:main', environment: 'staging', deploys: { sha: sha('a'), source: 'branch main', retry: 0 } },
    { file: `staging ${sha('c')}`, environment: 'staging', deploys: { sha: sha('c'), source: 'pinned commit cccccccccc', retry: 0 } },
    { file: 'preview branch:infra-rewrite', environment: 'preview', deploys: { sha: sha('b'), source: 'branch infra-rewrite', retry: 0 } },
  ])('deploys production always, any other environment only from its line: $environment with "$file"', async ({ file, environment, deploys }) => {
    const target = await resolveTarget({ environment, line: parseEnvironmentsFile(file).get(environment), listRemote });
    expect(target && { sha: target.sha, source: target.source, retry: target.retry }).toEqual(deploys);
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
