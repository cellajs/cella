import { resolve } from 'node:path';

/** `SCW_CONFIG_PATH` that neutralises the local Scaleway CLI profile: the file is never created, so the SDK finds nothing to load. */
export const scwConfigPathNone = (infraDir: string): string => resolve(infraDir, '.scw-config-none');

/** Resolve the repository and Scaleway-native project id variables to one value. Both present must match, so an exported CLI value cannot shadow repository configuration. */
export function resolveProjectId(): string | undefined {
  const repo = process.env.SCW_PROJECT_ID?.trim() || undefined;
  const ecosystem = process.env.SCW_DEFAULT_PROJECT_ID?.trim() || undefined;
  if (repo && ecosystem && repo !== ecosystem) {
    throw new Error(
      `SCW_PROJECT_ID (${repo}) and SCW_DEFAULT_PROJECT_ID (${ecosystem}) disagree: unset one so they match.`,
    );
  }
  return repo ?? ecosystem;
}

/**
 * Resolve the repository (`SCW_ORGANIZATION_ID`, the name backend/.env and the GitHub Environment use) and Scaleway-native
 * (`SCW_DEFAULT_ORGANIZATION_ID`, the name the provider and the Pulumi program read) organization id variables to one value. Both present must match.
 */
export function resolveOrganizationIdFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const repo = env.SCW_ORGANIZATION_ID?.trim() || undefined;
  const ecosystem = env.SCW_DEFAULT_ORGANIZATION_ID?.trim() || undefined;
  if (repo && ecosystem && repo !== ecosystem) {
    throw new Error(
      `SCW_ORGANIZATION_ID (${repo}) and SCW_DEFAULT_ORGANIZATION_ID (${ecosystem}) disagree: unset one so they match.`,
    );
  }
  return ecosystem ?? repo;
}

/** Inputs for {@link buildProviderEnv}. */
export interface ProviderEnvInput {
  /** Scaleway provider credentials (`SCW_ACCESS_KEY` / `SCW_SECRET_KEY`). */
  accessKey: string;
  secretKey: string;
  projectId: string;
  /** Pulumi state passphrase (`PULUMI_CONFIG_PASSPHRASE`). */
  passphrase: string;
  /** Credentials for the S3-protocol Pulumi state backend (`AWS_*`). Default to the provider credentials; override only when the backend needs a separate key. */
  stateAccessKey?: string;
  stateSecretKey?: string;
  /** Optional Scaleway organization id (`SCW_DEFAULT_ORGANIZATION_ID`). */
  organizationId?: string;
}

/** State-backend credential override for split-identity runs: the state-bucket policy admits only the admin and CI principals, so a bootstrap-key run 403s on `pulumi login` without an admitted key on the `AWS_*` side. */
export function stateKeyOverrideFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Pick<ProviderEnvInput, 'stateAccessKey' | 'stateSecretKey'> {
  const stateAccessKey = env.SCW_STATE_ACCESS_KEY?.trim() || undefined;
  const stateSecretKey = env.SCW_STATE_SECRET_KEY?.trim() || undefined;
  if (!!stateAccessKey !== !!stateSecretKey) {
    throw new Error('SCW_STATE_ACCESS_KEY and SCW_STATE_SECRET_KEY must be set together');
  }
  return { stateAccessKey, stateSecretKey };
}

/**
 * State-backend identity for a privileged run. An explicit `SCW_STATE_*` pair wins; otherwise the standing operator key already in the env
 * (`SCW_ACCESS_KEY` / `SCW_SECRET_KEY` from infra/.env.<mode>, the admin application's key, which the state-bucket policy admits); otherwise
 * empty, and the caller uses the bootstrap key for both sides.
 */
export function stateKeyForPrivilegedRun(
  env: NodeJS.ProcessEnv = process.env,
): Pick<ProviderEnvInput, 'stateAccessKey' | 'stateSecretKey'> {
  const explicit = stateKeyOverrideFromEnv(env);
  if (explicit.stateAccessKey) return explicit;
  const stateAccessKey = env.SCW_ACCESS_KEY?.trim() || undefined;
  const stateSecretKey = env.SCW_SECRET_KEY?.trim() || undefined;
  return stateAccessKey && stateSecretKey ? { stateAccessKey, stateSecretKey } : {};
}

/** Build a child environment with explicit Scaleway, S3-state, and Pulumi credentials, with local Scaleway profiles disabled so operator configuration cannot shadow the supplied identity. */
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
