import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type RunnerEnvironment, readRunnerEnvironments } from '../../runner/src/config';
import { infraDir } from '../utils/paths';

/**
 * The runner's committed file (D29): its project, the release its program runs from (D24) and the environments it starts deploys for (D23).
 * **Set up the runner** adds an environment; a change reaches the machine when **Replace the runner** replaces it.
 */
export const RUNNER_FILE = join(infraDir, 'runner.json');

export interface RunnerFile {
  /** The runner's own project, one per app. */
  projectId: string;
  /** The full commit, or the release tag, the runner's program is fetched at. */
  release: string;
  environments: RunnerEnvironment[];
}

/** The committed runner file, or undefined before the runner is set up. A file it cannot read is refused whole. */
export function readRunnerFile(path = RUNNER_FILE): RunnerFile | undefined {
  if (!existsSync(path)) return undefined;
  const { projectId, release, environments } = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  if (typeof projectId !== 'string' || !projectId) throw new Error(`${path} names no projectId`);
  if (typeof release !== 'string' || !release) throw new Error(`${path} names no release`);
  return { projectId, release, environments: readRunnerEnvironments(environments) };
}

export function writeRunnerFile(file: RunnerFile, path = RUNNER_FILE): void {
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
}

/** The list with `entry` in it: an environment already listed (by its definition in its project) is replaced, a new one appended. */
export function withEnvironment(environments: readonly RunnerEnvironment[], entry: RunnerEnvironment): RunnerEnvironment[] {
  const same = (other: RunnerEnvironment) => other.projectId === entry.projectId && other.definition === entry.definition;
  return environments.some(same) ? environments.map((other) => (same(other) ? entry : other)) : [...environments, entry];
}
