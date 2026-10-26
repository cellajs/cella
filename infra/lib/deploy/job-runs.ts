import { type ScwAuth, scwFetch } from '../scaleway/scw-fetch.ts';

/** One run of a job definition, as the Serverless Jobs API reports it. */
export interface JobRun {
  id: string;
  state: 'queued' | 'scheduled' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'internal_error' | string;
  exit_code?: number | null;
  error_message?: string;
  created_at?: string;
  started_at?: string | null;
  terminated_at?: string | null;
  environment_variables?: Record<string, string>;
}

const FINAL_STATES = new Set(['succeeded', 'failed', 'canceled', 'internal_error']);

/** True once a run has ended, whatever the outcome. */
export function runEnded(run: Pick<JobRun, 'state'>): boolean {
  return FINAL_STATES.has(run.state);
}

const base = (region: string) => `https://api.scaleway.com/serverless-jobs/v1alpha1/regions/${region}`;

/** The id of the project's job definition of that name, or undefined when there is none. */
export async function findJobDefinition(auth: ScwAuth, opts: { region: string; projectId: string; name: string }): Promise<string | undefined> {
  for (let page = 1; ; page++) {
    const { job_definitions = [], total_count = 0 } = await scwFetch<{ job_definitions?: Array<{ id: string; name: string }>; total_count?: number }>(
      auth,
      'GET',
      `${base(opts.region)}/job-definitions?project_id=${opts.projectId}&page=${page}&page_size=100`,
    );
    const found = job_definitions.find((definition) => definition.name === opts.name);
    if (found) return found.id;
    if (page * 100 >= total_count || job_definitions.length === 0) return undefined;
  }
}

/**
 * Every run of a definition Scaleway still keeps (60 days), newest first. Each run's `environment_variables` holds the definition's values
 * and its start call's, so a run names the target it was started for.
 */
export async function listJobRuns(auth: ScwAuth, opts: { region: string; projectId: string; definitionId: string }): Promise<JobRun[]> {
  const runs: JobRun[] = [];
  for (let page = 1; ; page++) {
    const { job_runs = [], total_count = 0 } = await scwFetch<{ job_runs?: JobRun[]; total_count?: number }>(
      auth,
      'GET',
      `${base(opts.region)}/job-runs?project_id=${opts.projectId}&job_definition_id=${opts.definitionId}&order_by=created_at_desc&page=${page}&page_size=100`,
    );
    runs.push(...job_runs);
    if (page * 100 >= total_count || job_runs.length === 0) return runs;
  }
}

/**
 * Start one run of a definition. The values go in the start call, which anyone who reads job runs can see: a target and a counter, never a
 * key (keys reach a run by secret reference).
 */
export async function startJobRun(auth: ScwAuth, opts: { region: string; definitionId: string; values: Record<string, string> }): Promise<JobRun> {
  const { job_runs = [] } = await scwFetch<{ job_runs?: JobRun[] }>(auth, 'POST', `${base(opts.region)}/job-definitions/${opts.definitionId}/start`, {
    environment_variables: opts.values,
  });
  const [run] = job_runs;
  if (!run) throw new Error('the start call returned no run');
  return run;
}

/** One run as it stands. */
export function readJobRun(auth: ScwAuth, opts: { region: string; runId: string }): Promise<JobRun> {
  return scwFetch<JobRun>(auth, 'GET', `${base(opts.region)}/job-runs/${opts.runId}`);
}
