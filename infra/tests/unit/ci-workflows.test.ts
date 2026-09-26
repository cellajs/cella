import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const workflowsDir = path.join(repoRoot, '.github/workflows');

/** Each job's body by name: the lines under a two-space `<name>:` header in the top-level `jobs:` block. */
function jobsOf(workflow: string): Map<string, string> {
  const lines = workflow.split('\n');
  const jobs = new Map<string, string>();
  let current: string | undefined;
  for (const line of lines.slice(lines.indexOf('jobs:') + 1)) {
    const header = /^ {2}([\w-]+):\s*$/.exec(line);
    if (header?.[1]) {
      current = header[1];
      jobs.set(current, '');
    } else if (/^\S/.test(line)) break;
    else if (current) jobs.set(current, `${jobs.get(current)}${line}\n`);
  }
  return jobs;
}

/**
 * Jobs that hold a secret (a job-level `environment:` or a `secrets.` reference) and the jobs whose outputs such a job
 * reads: what those produce runs, or is interpolated, where the secrets are.
 */
function trustedJobs(jobs: Map<string, string>): Set<string> {
  const holdsSecrets = ([, body]: [string, string]) => /^ {4}environment:|\bsecrets\./m.test(body);
  const trusted = new Set([...jobs].filter(holdsSecrets).map(([name]) => name));
  let grew = true;
  while (grew) {
    grew = false;
    for (const name of jobs.keys()) {
      if (trusted.has(name)) continue;
      if ([...trusted].some((reader) => jobs.get(reader)?.includes(`needs.${name}.outputs`))) {
        trusted.add(name);
        grew = true;
      }
    }
  }
  return trusted;
}

/** A dependency cache a job restores and saves: setup-node's `cache:` or actions/cache. */
const restoresCache = (body: string) => /^\s+cache:\s*\S/m.test(body) || body.includes('actions/cache');

const workflows = readdirSync(workflowsDir)
  .filter((file) => file.endsWith('.yml'))
  .map((file) => ({ file, jobs: jobsOf(readFileSync(path.join(workflowsDir, file), 'utf8')) }));

describe('CI workflows', () => {
  it('must not run a job that holds secrets on a dependency cache a secretless job can write', () => {
    // Every job saves the pnpm store under one lockfile-hashed key; a secretless job running third-party build code
    // could plant a package in it that the deploy then runs with its keys.
    const offenders = workflows.flatMap(({ file, jobs }) =>
      [...trustedJobs(jobs)].filter((name) => restoresCache(jobs.get(name) ?? '')).map((name) => `${file}: ${name}`),
    );
    expect(offenders).toEqual([]);

    // Positive control: the parser finds the jobs, and the secretless ones keep their cache.
    const pipeline = workflows.find(({ file }) => file === 'deploy-pipeline.yml')?.jobs;
    expect(trustedJobs(pipeline ?? new Map())).toEqual(
      new Set(['setup', 'build-images', 'build-boot-image', 'deploy', 'reap']),
    );
    expect(restoresCache(pipeline?.get('build-frontend') ?? '')).toBe(true);
  });

  it('must not skip the schema-bust gate via a base spec git never tracks', () => {
    const gate = workflows.find(({ file }) => file === 'ci.yml')?.jobs.get('schema-bust-gate') ?? '';
    const spec = /^\s+SPEC=(\S+)$/m.exec(gate)?.[1] ?? '';

    expect(spec).not.toBe('');
    // The gate reads the base branch's committed spec: an ignored or untracked path never exists there.
    const tracked = () => execFileSync('git', ['ls-files', '--error-unmatch', spec], { cwd: repoRoot, stdio: 'pipe' });
    expect(tracked).not.toThrow();
  });
});
