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

/**
 * Resolve the Scaleway project id from the environment, reconciling the two
 * accepted variable names.
 *
 * `SCW_PROJECT_ID` is this repo's own `.env` convention (see
 * `backend/.env.example`); `SCW_DEFAULT_PROJECT_ID` is the name the Scaleway
 * SDK / Terraform provider / `scw` CLI read natively (and what CI and
 * `buildProviderEnv` inject). Either is accepted, but if both are set they MUST
 * agree — a mismatch almost always means a stale `SCW_DEFAULT_PROJECT_ID`
 * exported in the shell is silently shadowing the repo's `SCW_PROJECT_ID`, so we
 * fail loudly rather than guess which one is intended.
 *
 * Returns the single agreed value, or `undefined` when neither is set (callers
 * decide whether that is fatal).
 */
export function resolveProjectId(): string | undefined {
  const repo = process.env.SCW_PROJECT_ID?.trim() || undefined
  const ecosystem = process.env.SCW_DEFAULT_PROJECT_ID?.trim() || undefined
  if (repo && ecosystem && repo !== ecosystem) {
    throw new Error(
      `SCW_PROJECT_ID (${repo}) and SCW_DEFAULT_PROJECT_ID (${ecosystem}) disagree — unset one so they match.`,
    )
  }
  return repo ?? ecosystem
}

/** Inputs for {@link buildProviderEnv}. */
export interface ProviderEnvInput {
  /** Scaleway provider credentials (`SCW_ACCESS_KEY` / `SCW_SECRET_KEY`). */
  accessKey: string
  secretKey: string
  /** Scaleway project id (`SCW_PROJECT_ID` / `SCW_DEFAULT_PROJECT_ID`). */
  projectId: string
  /** Pulumi state passphrase (`PULUMI_CONFIG_PASSPHRASE`). */
  passphrase: string
  /** Credentials for the S3-protocol Pulumi state backend (`AWS_*`). The state
   *  bucket lives in the same Scaleway project, so these default to the
   *  provider credentials; override only when the backend needs a separate key. */
  stateAccessKey?: string
  stateSecretKey?: string
  /** Optional Scaleway organization id (`SCW_DEFAULT_ORGANIZATION_ID`). */
  organizationId?: string
}

/**
 * Build the child-process env for a Pulumi/Scaleway invocation.
 *
 * Single source of truth for the credential wiring that three different
 * consumers each read from differently-named variables: the Scaleway provider
 * (`SCW_*`), the S3-protocol Pulumi state backend (`AWS_*`, same credentials,
 * different contract), and Pulumi itself (`PULUMI_CONFIG_PASSPHRASE`). It also
 * applies the two guards that pin provider auth to *these* credentials by
 * neutralising any local Scaleway CLI profile: `SCW_CONFIG_PATH` points at a
 * non-existent file and `SCW_PROFILE` is emptied so a profile exported in the
 * operator's shell cannot pass through and shadow the supplied key.
 *
 * The current process env is inherited (`PATH`, `HOME`, … are required by the
 * child) and the credential vars are set last so they always win over anything
 * already present in the environment.
 */
export function buildProviderEnv(infraDir: string, input: ProviderEnvInput): NodeJS.ProcessEnv {
  const { accessKey, secretKey, projectId, passphrase, organizationId } = input
  const stateAccessKey = input.stateAccessKey ?? accessKey
  const stateSecretKey = input.stateSecretKey ?? secretKey

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SCW_ACCESS_KEY: accessKey,
    SCW_SECRET_KEY: secretKey,
    SCW_DEFAULT_PROJECT_ID: projectId,
    SCW_PROJECT_ID: projectId,
    AWS_ACCESS_KEY_ID: stateAccessKey,
    AWS_SECRET_ACCESS_KEY: stateSecretKey,
    PULUMI_CONFIG_PASSPHRASE: passphrase,
    SCW_CONFIG_PATH: scwConfigPathNone(infraDir),
    SCW_PROFILE: '',
  }
  if (organizationId) env.SCW_DEFAULT_ORGANIZATION_ID = organizationId
  return env
}
