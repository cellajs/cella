import { resolve } from 'node:path';
import { projectAccessKey } from './s3-client';

/** `SCW_CONFIG_PATH` that neutralises the local Scaleway CLI profile: the file is never created, so the SDK finds nothing to load. */
export const scwConfigPathNone = (infraDir: string): string => resolve(infraDir, '.scw-config-none');

/** Inputs for {@link buildProviderEnv}. */
export interface ProviderEnvInput {
  /** The key the Scaleway provider authenticates with (`SCW_ACCESS_KEY` / `SCW_SECRET_KEY`, the names the provider reads). */
  accessKey: string;
  secretKey: string;
  projectId: string;
  /** Pulumi state passphrase (`PULUMI_CONFIG_PASSPHRASE`). */
  passphrase: string;
  /** The key for the S3-protocol Pulumi state backend (`AWS_*`). Defaults to the provider key; set it when the state bucket admits a different one (the admin application key). */
  stateAccessKey?: string;
  stateSecretKey?: string;
  /** Optional Scaleway organization id (`SCW_DEFAULT_ORGANIZATION_ID`). */
  organizationId?: string;
}

/** Build a child environment with an explicit Scaleway key, state-backend key and Pulumi passphrase, with local Scaleway profiles disabled so operator configuration cannot shadow the supplied identity. */
export function buildProviderEnv(infraDir: string, input: ProviderEnvInput): Record<string, string> {
  const { accessKey, secretKey, projectId, passphrase, organizationId } = input;
  // The state side names the project: a key made for another environment's project reaches this one's state bucket that way.
  const stateAccessKey = projectAccessKey(input.stateAccessKey ?? accessKey, projectId);
  const stateSecretKey = input.stateSecretKey ?? secretKey;

  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) if (value !== undefined) env[name] = value;
  Object.assign(env, {
    SCW_ACCESS_KEY: accessKey,
    SCW_SECRET_KEY: secretKey,
    SCW_DEFAULT_PROJECT_ID: projectId,
    AWS_ACCESS_KEY_ID: stateAccessKey,
    AWS_SECRET_ACCESS_KEY: stateSecretKey,
    PULUMI_CONFIG_PASSPHRASE: passphrase,
    SCW_CONFIG_PATH: scwConfigPathNone(infraDir),
    SCW_PROFILE: '',
  });
  if (organizationId) env.SCW_DEFAULT_ORGANIZATION_ID = organizationId;
  return env;
}
