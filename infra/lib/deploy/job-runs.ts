import { type ScwAuth, scwFetch } from '../scaleway/scw-fetch.ts';

/** How a definition or a run names what it executes: the startup command and its arguments, and the single command Scaleway deprecates. */
interface CommandFields {
  startup_command?: string[] | null;
  args?: string[] | null;
  command?: string | null;
}

/** One run of a job definition, as the Serverless Jobs API reports it. Its command fields hold the definition's, or what its start call set. */
export interface JobRun extends CommandFields {
  id: string;
  state: 'initialized' | 'validated' | 'queued' | 'running' | 'retrying' | 'interrupting' | 'succeeded' | 'failed' | 'interrupted' | string;
  exit_code?: number | null;
  error_message?: string;
  created_at?: string;
  started_at?: string | null;
  terminated_at?: string | null;
  environment_variables?: Record<string, string>;
}

const FINAL_STATES = new Set(['succeeded', 'failed', 'interrupted']);

/** True once a run has ended, whatever the outcome. */
export function runEnded(run: Pick<JobRun, 'state'>): boolean {
  return FINAL_STATES.has(run.state);
}

/**
 * What a definition or a run executes, as one string to compare: the startup command, its arguments, and the deprecated command where one is
 * set, joined by newlines. Undefined when none is set.
 */
export function commandOf(fields: CommandFields): string | undefined {
  const parts = [...(fields.startup_command ?? []), ...(fields.args ?? []), ...(fields.command ? [fields.command] : [])];
  return parts.length > 0 ? parts.join('\n') : undefined;
}

// v1alpha1 reports a definition written with a startup command, and each of its runs, with an empty command and no startup command.
const base = (region: string) => `https://api.scaleway.com/serverless-jobs/v1alpha2/regions/${region}`;

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

/** What a job definition runs, as Scaleway holds it: undefined where the API names a field not. */
export interface JobDefinitionFacts {
  imageUri?: string;
  /** What it executes, as {@link commandOf} reads it. */
  command?: string;
  env: Record<string, string>;
  /** When the definition last changed: a run started before it may have run other values or another command. */
  updatedAt?: string;
}

/** What a job definition runs, as Scaleway holds it: the image, the command and its arguments, the env and when it last changed. */
export async function readJobDefinition(auth: ScwAuth, opts: { region: string; definitionId: string }): Promise<JobDefinitionFacts> {
  const definition = await scwFetch<
    CommandFields & { image_uri?: string; environment_variables?: Record<string, string> | null; updated_at?: string | null }
  >(auth, 'GET', `${base(opts.region)}/job-definitions/${opts.definitionId}`);
  return {
    imageUri: definition.image_uri,
    command: commandOf(definition),
    env: definition.environment_variables ?? {},
    updatedAt: definition.updated_at ?? undefined,
  };
}

/** One secret a definition references: the Secret Manager id, and the env var or file it lands in. */
export interface JobSecretReference {
  secretId: string;
  env?: string;
  file?: string;
}

/** The secrets a job definition references, as Scaleway holds them. */
export async function readJobDefinitionSecrets(auth: ScwAuth, opts: { region: string; definitionId: string }): Promise<JobSecretReference[]> {
  const { secrets = [] } = await scwFetch<{
    secrets?: Array<{ secret_manager_id: string; env_var?: { name?: string } | null; file?: { path?: string } | null }>;
  }>(auth, 'GET', `${base(opts.region)}/secrets?job_definition_id=${opts.definitionId}`);
  return secrets.map((secret) => ({
    // An id may come as `<region>/<uuid>`, as the provider writes it.
    secretId: secret.secret_manager_id.split('/').pop() ?? secret.secret_manager_id,
    ...(secret.env_var?.name ? { env: secret.env_var.name } : {}),
    ...(secret.file?.path ? { file: secret.file.path } : {}),
  }));
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
