import { describe, expect, it } from 'vitest';
import { findJobDefinition, runEnded, startJobRun } from './job-runs';

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
    expect(requests[0]?.url).toMatch(/\/serverless-jobs\/v1alpha1\/regions\/nl-ams\/job-definitions\/d1\/start$/);
  });

  it('knows when a run has ended', () => {
    expect(['succeeded', 'failed', 'canceled', 'internal_error'].every((state) => runEnded({ state }))).toBe(true);
    expect(['queued', 'scheduled', 'running'].some((state) => runEnded({ state }))).toBe(false);
  });
});
