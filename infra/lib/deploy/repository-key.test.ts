import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gitKeyOptions } from './git-remote';
import { readRepositoryKey, repositoryUrl } from './repository-key';

const secrets = (stored?: { value: string; versions?: number }) => ({
  getSecretByName: async (name: string, path: string) =>
    stored && name === 'repository-read-key' && path === '/cella-staging/deploy/' ? { id: 'key-1', version_count: stored.versions ?? 1 } : undefined,
  accessLatestValue: async () => stored?.value ?? '',
});

describe('the repository read key', () => {
  it('is read from the deploy folder, and is absent for a repository anyone may read', async () => {
    expect(await readRepositoryKey(secrets({ value: 'github_pat_x\n' }), 'cella', 'staging')).toBe('github_pat_x');
    expect(await readRepositoryKey(secrets(), 'cella', 'staging')).toBeUndefined();
    expect(await readRepositoryKey(secrets({ value: 'x', versions: 0 }), 'cella', 'staging')).toBeUndefined();
  });

  it('goes with one git command as a header, never in the URL', () => {
    const options = gitKeyOptions('github_pat_x');
    expect(options[0]).toBe('-c');
    expect(options[1]).toBe(`http.extraHeader=Authorization: Basic ${Buffer.from('x-access-token:github_pat_x').toString('base64')}`);
    expect(gitKeyOptions(undefined)).toEqual([]);
  });

  it('is used for the repository the root package.json names, as git reads it', () => {
    const root = mkdtempSync(join(tmpdir(), 'repository-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ repository: 'https://github.com/acme/app' }));
    expect(repositoryUrl(root)).toBe('https://github.com/acme/app.git');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ repository: 'git@github.com:acme/app.git' }));
    expect(() => repositoryUrl(root)).toThrow(/https URL/);
  });
});
