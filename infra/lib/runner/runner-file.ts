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
  /** The runner's own project. */
  projectId: string;
  /** The full commit, or the release tag, the runner's program is fetched at. */
  release: string;
  environments: RunnerEnvironment[];
}

/** The runner a runner action works on. */
export interface Runner {
  /** Names its project, application, address, security group and machine. */
  name: string;
  /** True for an organization's runner, whose file names it and lives in the organization's own repository; false for the app's own. */
  organization: boolean;
  path: string;
  /** Undefined until Set up the runner makes it, and in an app whose deploys an organization's runner starts. */
  file?: RunnerFile;
}

let flagPath: string | undefined;

/** `--runner-file`: the file of an organization's runner, from a checkout of the organization's repository. */
export function setRunnerFile(path: string): void {
  flagPath = path;
}

/** The path `--runner-file` gave; undefined without the flag. */
export function runnerFileFlag(): string | undefined {
  return flagPath;
}

/**
 * The runner a file describes. A file with a `name` is an organization's runner; a file holding only that name is one before its setup, and
 * in an app it names the organization's runner that starts its deploys. A file it cannot read is refused whole.
 */
export function readRunner(appSlug: string, path: string): Runner {
  const { name, projectId, release, environments } = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>) : {};
  if (name !== undefined && (typeof name !== 'string' || !/^[a-z0-9-]+-runner$/.test(name))) {
    throw new Error(`${path}: name must be lowercase letters, digits and dashes, ending in -runner`);
  }
  const runner = { name: name ?? `${appSlug}-runner`, organization: name !== undefined, path };
  if (projectId === undefined) return runner;
  if (typeof projectId !== 'string' || !projectId) throw new Error(`${path} names no projectId`);
  if (typeof release !== 'string' || !release) throw new Error(`${path} names no release`);
  return { ...runner, file: { projectId, release, environments: readRunnerEnvironments(environments) } };
}

/**
 * The runner a runner action works on: the one `--runner-file` names, else the app's own. An app whose own file names an organization's
 * runner is refused, so no app checkout writes a partial list of that runner or replaces its machine.
 */
export function actionRunner(appSlug: string): Runner {
  const runner = readRunner(appSlug, flagPath ?? RUNNER_FILE);
  if (runner.organization && !flagPath) {
    throw new Error(`'${runner.name}' starts this app's deploys: name its file in your organization's repository with --runner-file <path>`);
  }
  return runner;
}

export function writeRunnerFile(runner: Runner, file: RunnerFile): void {
  writeFileSync(runner.path, `${JSON.stringify({ ...(runner.organization ? { name: runner.name } : {}), ...file }, null, 2)}\n`);
}

/** The list with `entry` in it: an environment already listed (by its definition in its project) is replaced, a new one appended. */
export function withEnvironment(environments: readonly RunnerEnvironment[], entry: RunnerEnvironment): RunnerEnvironment[] {
  const same = (other: RunnerEnvironment) => other.projectId === entry.projectId && other.definition === entry.definition;
  return environments.some(same) ? environments.map((other) => (same(other) ? entry : other)) : [...environments, entry];
}
