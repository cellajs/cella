/**
 * Small pure helpers shared between the bootstrap command handlers.
 *
 * The SCW env-var dance has a single goal: leave exactly ONE source of
 * Scaleway provider credentials per invocation, so the Terraform provider
 * never trips on an unrelated `~/.config/scw/config.yaml` profile.
 */
import { resolve } from 'node:path'

/** Path used as `SCW_CONFIG_PATH` to neutralise the user's local Scaleway CLI
 *  profile without giving the SDK a bogus profile name to look up. The file
 *  is never created — the SDK simply finds nothing to load. */
export const scwConfigPathNone = (infraDir: string): string => resolve(infraDir, '.scw-config-none')
