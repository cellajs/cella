import { resolve } from 'node:path';

/** Path used as `SCW_CONFIG_PATH` to neutralise the user's local Scaleway CLI
 *  profile without giving the SDK a bogus profile name to look up. The file
 *  is never created, so the SDK simply finds nothing to load. */
export const scwConfigPathNone = (infraDir: string): string => resolve(infraDir, '.scw-config-none');

/**
 * Resolves the repository and Scaleway-native project ID variables to one value.
 * When both are present they must match, preventing an exported CLI value from silently
 * shadowing repository configuration. Returns undefined when neither is set.
 */
export function resolveProjectId(): string | undefined {
  const repo = process.env.SCW_PROJECT_ID?.trim() || undefined;
  const ecosystem = process.env.SCW_DEFAULT_PROJECT_ID?.trim() || undefined;
  if (repo && ecosystem && repo !== ecosystem) {
    throw new Error(
      `SCW_PROJECT_ID (${repo}) and SCW_DEFAULT_PROJECT_ID (${ecosystem}) disagree — unset one so they match.`,
    );
  }
  return repo ?? ecosystem;
}

/** Inputs for {@link buildProviderEnv}. */
export interface ProviderEnvInput {
  /** Scaleway provider credentials (`SCW_ACCESS_KEY` / `SCW_SECRET_KEY`). */
  accessKey: string;
  secretKey: string;
  /** Scaleway project id (`SCW_PROJECT_ID` / `SCW_DEFAULT_PROJECT_ID`). */
  projectId: string;
  /** Pulumi state passphrase (`PULUMI_CONFIG_PASSPHRASE`). */
  passphrase: string;
  /** Credentials for the S3-protocol Pulumi state backend (`AWS_*`). The state
   *  bucket lives in the same Scaleway project, so these default to the
   *  provider credentials; override only when the backend needs a separate key. */
  stateAccessKey?: string;
  stateSecretKey?: string;
  /** Optional Scaleway organization id (`SCW_DEFAULT_ORGANIZATION_ID`). */
  organizationId?: string;
}

/**
 * State-backend credential override from `SCW_STATE_ACCESS_KEY` /
 * `SCW_STATE_SECRET_KEY`, for split-identity runs: the state-bucket policy is
 * deny-by-default and admits only the CI and admin principals, so a
 * bootstrap-key run 403s on `pulumi login` unless an admitted key (e.g. an
 * ephemeral operator/admin key) is supplied for the `AWS_*` side.
 */
export function stateKeyOverrideFromEnv(): Pick<ProviderEnvInput, 'stateAccessKey' | 'stateSecretKey'> {
  const stateAccessKey = process.env.SCW_STATE_ACCESS_KEY?.trim() || undefined;
  const stateSecretKey = process.env.SCW_STATE_SECRET_KEY?.trim() || undefined;
  if (!!stateAccessKey !== !!stateSecretKey) {
    throw new Error('SCW_STATE_ACCESS_KEY and SCW_STATE_SECRET_KEY must be set together');
  }
  return { stateAccessKey, stateSecretKey };
}

/**
 * Builds a child environment with explicit Scaleway, S3-state, and Pulumi credentials.
 * It inherits process utilities but overrides credential variables and disables local
 * Scaleway profiles so operator configuration cannot shadow the supplied identity.
 */
export function buildProviderEnv(infraDir: string, input: ProviderEnvInput): NodeJS.ProcessEnv {
  const { accessKey, secretKey, projectId, passphrase, organizationId } = input;
  const stateAccessKey = input.stateAccessKey ?? accessKey;
  const stateSecretKey = input.stateSecretKey ?? secretKey;

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
  };
  if (organizationId) env.SCW_DEFAULT_ORGANIZATION_ID = organizationId;
  return env;
}
