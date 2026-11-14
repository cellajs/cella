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
  /** The app's state bucket URL (`PULUMI_BACKEND_URL`): it outranks the machine-wide `pulumi login`, which another app's run on this machine may have changed. */
  stateBackendUrl: string;
  /** Optional Scaleway organization id (`SCW_DEFAULT_ORGANIZATION_ID`). */
  organizationId?: string;
}

/** Build a child environment with an explicit Scaleway key, state backend and Pulumi passphrase, with local Scaleway profiles disabled so operator configuration cannot shadow the supplied identity. The key also opens the S3-protocol state backend (`AWS_*`). */
export function buildProviderEnv(infraDir: string, input: ProviderEnvInput): Record<string, string> {
  const { accessKey, secretKey, projectId, passphrase, stateBackendUrl, organizationId } = input;
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) if (value !== undefined) env[name] = value;
  Object.assign(env, {
    SCW_ACCESS_KEY: accessKey,
    SCW_SECRET_KEY: secretKey,
    SCW_DEFAULT_PROJECT_ID: projectId,
    // The state side names the project: a key made for another environment's project reaches this one's state bucket that way.
    AWS_ACCESS_KEY_ID: projectAccessKey(accessKey, projectId),
    AWS_SECRET_ACCESS_KEY: secretKey,
    PULUMI_CONFIG_PASSPHRASE: passphrase,
    PULUMI_BACKEND_URL: stateBackendUrl,
    SCW_CONFIG_PATH: scwConfigPathNone(infraDir),
    SCW_PROFILE: '',
  });
  if (organizationId) env.SCW_DEFAULT_ORGANIZATION_ID = organizationId;
  return env;
}
