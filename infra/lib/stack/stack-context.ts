import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EngineConfig } from '../../config/engine-config';
import { resolveProjectId } from '../scaleway/provider-env';
import { loadModeEnvFile } from '../utils/env-files';
import { infraDir } from '../utils/paths';
import { detectStackState, type Environment, type StackState } from './bootstrap-stack-state';

/** What an operator entry (the CLI menu, the standalone status task) knows about the target stack once its env file and config are loaded. */
export interface StackContext {
  environment: Environment;
  stackPath: string;
  stackYaml?: string;
  state: StackState;
  appConfig: EngineConfig;
  /** Scaleway project id. Empty only on a fresh install without SCW_PROJECT_ID; the setup wizard resolves it. */
  projectId: string;
  /** Superseded key names the env file still uses, for the CLI to print once. */
  envWarnings: string[];
}

/**
 * Load the stack context for a mode in the one order every entry point must follow: the mode env file (it overrides the ambient env), then
 * APP_MODE, which the config reads during module evaluation, then the config itself. `log` receives the env-file notices; silent by default
 * so machine output (`status --json`) stays parseable.
 */
export async function loadStackContext(
  environment: Environment,
  log?: (message: string) => void,
): Promise<StackContext> {
  const envWarnings = loadModeEnvFile(environment, log);
  const stackPath = resolve(infraDir, `Pulumi.${environment}.yaml`);
  const stackYaml = existsSync(stackPath) ? readFileSync(stackPath, 'utf8') : undefined;
  const state = detectStackState({ yamlText: stackYaml });
  process.env.APP_MODE = environment;
  const { loadEngineConfig } = await import('../../config/engine-config');
  const appConfig = await loadEngineConfig();
  return { environment, stackPath, stackYaml, state, appConfig, projectId: resolveProjectId() ?? '', envWarnings };
}
