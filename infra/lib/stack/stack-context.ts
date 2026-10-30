import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EngineConfig } from '../../config/engine-config';
import { resolveProjectId } from '../scaleway/provider-env';
import { loadModeEnvFile, ownProjectId, sharedFileProjectId } from '../utils/env-files';
import { infraDir } from '../utils/paths';
import { detectStackState, type Environment, type StackState } from './bootstrap-stack-state';
import { type ProjectIdSource, resolveModeProject, stackFileProjectId } from './project-per-mode';

/** What an operator entry (the CLI menu, the standalone status task) knows about the target stack once its env file and config are loaded. */
export interface StackContext {
  environment: Environment;
  stackPath: string;
  stackYaml?: string;
  state: StackState;
  appConfig: EngineConfig;
  /** Scaleway project id of this environment. Empty when the mode has none of its own yet; the setup wizard picks or creates it. */
  projectId: string;
  /** Where the id comes from. `env-file` is an id the CLI still has to move to the stack file. */
  projectIdSource: ProjectIdSource;
  /** Superseded key names the env file still uses, for the CLI to print once. */
  envWarnings: string[];
}

/**
 * Load the stack context for a mode in the one order every entry point must follow: the mode env file (it overrides the ambient env), then
 * APP_MODE, which the config reads during module evaluation, then the config itself. `log` receives the env-file notices; silent by default
 * so machine output (`status --json`) stays parseable.
 */
export async function loadStackContext(environment: Environment, log?: (message: string) => void): Promise<StackContext> {
  const envWarnings = loadModeEnvFile(environment, log);
  const stackPath = resolve(infraDir, `Pulumi.${environment}.yaml`);
  const stackYaml = existsSync(stackPath) ? readFileSync(stackPath, 'utf8') : undefined;
  const state = detectStackState({ yamlText: stackYaml });
  process.env.APP_MODE = environment;
  const { loadEngineConfig } = await import('../../config/engine-config');
  const appConfig = await loadEngineConfig();
  const project = resolveModeProject({
    stack: stackFileProjectId(stackYaml),
    own: ownProjectId(environment),
    resolved: resolveProjectId(),
    shared: sharedFileProjectId(),
    hasStack: stackYaml !== undefined,
  });
  // A mode without a stack does not take the project of a file every mode reads: nothing later in this run may resolve it either.
  if (project.dropShared) delete process.env.SCW_PROJECT_ID;
  // The stack file decides over backend/.env, which every mode reads, for all this run's tasks.
  if (project.projectId) process.env.SCW_PROJECT_ID = project.projectId;
  return { environment, stackPath, stackYaml, state, appConfig, projectId: project.projectId, projectIdSource: project.source, envWarnings };
}
