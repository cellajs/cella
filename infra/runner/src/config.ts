/** One environment the runner serves (D23): an entry of the committed `infra/runner.json`, which reaches the machine in its user data. */
export interface RunnerEnvironment {
  /** The environment's name, and its line in the repository's environments file. */
  environment: string;
  projectId: string;
  region: string;
  /** The name of the environment's main job definition. */
  definition: string;
  /** The https URL its targets are read from. */
  repository: string;
}

/** Check a list of the environments the runner serves; a list it cannot read is refused whole. */
export function readRunnerEnvironments(environments: unknown): RunnerEnvironment[] {
  if (!Array.isArray(environments) || environments.length === 0) throw new Error('the runner lists no environments');
  return environments.map((entry: Record<string, unknown>, index) => {
    const field = (name: keyof RunnerEnvironment): string => {
      const value = entry[name];
      if (typeof value !== 'string' || value === '') throw new Error(`environments[${index}] has no ${name}`);
      return value;
    };
    const repository = field('repository');
    if (!repository.startsWith('https://')) throw new Error(`environments[${index}]: the repository must be an https URL`);
    return { environment: field('environment'), projectId: field('projectId'), region: field('region'), definition: field('definition'), repository };
  });
}
