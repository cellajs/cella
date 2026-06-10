/**
 * Small pure helpers shared between the bootstrap command handlers.
 *
 * The SCW env-var dance has a single goal: leave exactly ONE source of
 * Scaleway provider credentials per invocation, so the Terraform provider
 * never warns about "Multiple variable sources" or trips on an unrelated
 * `~/.config/scw/config.yaml` profile.
 */
import { resolve } from 'node:path'

/** Path used as `SCW_CONFIG_PATH` to neutralise the user's local Scaleway CLI
 *  profile without giving the SDK a bogus profile name to look up. The file
 *  is never created — the SDK simply finds nothing to load. */
export const scwConfigPathNone = (infraDir: string): string => resolve(infraDir, '.scw-config-none')

/** Returns a new env object with the Scaleway access/secret/project env vars
 *  removed. Used when stack config has scaleway:accessKey/secretKey set (the
 *  provider{} block should be the sole credential source). Pure. */
export function stripScwProviderEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { SCW_ACCESS_KEY: _a, SCW_SECRET_KEY: _s, SCW_DEFAULT_PROJECT_ID: _p, SCW_PROJECT_ID: _pp, ...rest } = env
  return rest
}

/** Manual recovery commands printed when automatic CI-key restore fails.
 *  Returns the two `pulumi config set` lines (without colour codes — callers
 *  apply colour). Pure. */
export function manualRestoreCommands(stackName: string, ciAccess: string, ciSecret: string): string[] {
  return [
    `pulumi config set --secret scaleway:accessKey ${ciAccess} --stack ${stackName}`,
    `pulumi config set --secret scaleway:secretKey ${ciSecret} --stack ${stackName}`,
  ]
}
