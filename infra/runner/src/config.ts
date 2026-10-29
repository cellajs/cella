/** One environment the runner serves (D23): an entry of the committed `infra/runner.json`, which reaches the machine in its user data. */
export interface RunnerEnvironment {
  /** The environment's name, and its line in the repository's environments file. */
  environment: string;
  projectId: string;
  region: string;
  /** The name of the environment's main job definition. */
  definition: string;
  /** The https URL its targets are read from; the runner starts nothing where the definition's `REPO` names another. */
  repository: string;
}

/** A repository URL's owner and name, as one lowercase word joined by dashes: `cellajs-projectcampus`. */
export function repositorySlug(repository: string): string {
  return new URL(repository).pathname
    .replace(/\.git$/, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/** The env var a served private repository's read key reaches the runner in (Q6). */
export function readKeyVariable(repository: string): string {
  return `READ_KEY_${repositorySlug(repository).replace(/-/g, '_').toUpperCase()}`;
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
