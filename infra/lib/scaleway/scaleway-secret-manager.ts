import type { FetchLike } from '../utils/fetch-like'
import { type ScwAuth, scwFetch, scwSend } from './scw-fetch'

const SECRET_MANAGER_BASE = 'https://api.scaleway.com/secret-manager/v1beta1'

export interface SecretManagerSecret {
  id: string
  name: string
  path: string
  description?: string | null
  protected?: boolean
  version_count?: number
  status?: string
  region?: string
}

export interface SecretManagerSecretVersion {
  revision: number
  secret_id: string
  status?: string
  created_at?: string | null
  updated_at?: string | null
  description?: string | null
  latest?: boolean
  region?: string
}

interface SecretListResponse {
  secrets: SecretManagerSecret[]
  total_count: number
}

interface AccessSecretVersionResponse {
  data: string
  revision: number
  secret_id: string
}

export interface SecretManagerClientOptions {
  secretKey: string
  region: string
  projectId: string
  fetchImpl?: FetchLike
}

export interface EnsureSecretInput {
  name: string
  path: string
  description: string
  protect?: boolean
}

export interface PutSecretValueInput {
  secretId: string
  value: string
  description?: string
  disablePrevious?: boolean
}

function buildSecretsUrl(region: string, query: URLSearchParams) {
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  return `${SECRET_MANAGER_BASE}/regions/${region}/secrets${suffix}`
}

/**
 * Scaleway stores secret folder paths in canonical form WITHOUT a trailing
 * slash (it normalizes `/foo/` → `/foo`). Both the `path` list filter and the
 * `path` returned on each secret use that form, so we must normalize before
 * filtering or comparing — otherwise a container created by an earlier run
 * (queried/compared as `/foo/`) is never found, breaking idempotency and
 * triggering a `cannot have same secret name in same path` 400 on re-create.
 */
function normalizeSecretPath(path: string): string {
  return path === '/' ? path : path.replace(/\/+$/, '')
}

export function createSecretManagerClient(options: SecretManagerClientOptions) {
  const auth: ScwAuth = { secretKey: options.secretKey, fetchImpl: options.fetchImpl }

  return {
    async listSecrets(path?: string): Promise<SecretManagerSecret[]> {
      const query = new URLSearchParams({
        project_id: options.projectId,
        scheduled_for_deletion: 'false',
      })
      if (path) query.set('path', normalizeSecretPath(path))
      const response = await scwFetch<SecretListResponse>(auth, 'GET', buildSecretsUrl(options.region, query))
      return response.secrets
    },

    async getSecretByName(name: string, path: string): Promise<SecretManagerSecret | undefined> {
      const wantPath = normalizeSecretPath(path)
      const secrets = await this.listSecrets(path)
      return secrets.find((secret) => secret.name === name && normalizeSecretPath(secret.path) === wantPath)
    },

    async ensureSecret(input: EnsureSecretInput): Promise<SecretManagerSecret> {
      const existing = await this.getSecretByName(input.name, input.path)
      if (existing) return existing

      return await scwFetch<SecretManagerSecret>(auth, 'POST', buildSecretsUrl(options.region, new URLSearchParams()), {
        project_id: options.projectId,
        name: input.name,
        path: input.path,
        description: input.description,
        protected: input.protect ?? false,
      })
    },

    async putSecretValue(input: PutSecretValueInput): Promise<SecretManagerSecretVersion> {
      return await scwFetch<SecretManagerSecretVersion>(
        auth,
        'POST',
        `${SECRET_MANAGER_BASE}/regions/${options.region}/secrets/${input.secretId}/versions`,
        {
          data: Buffer.from(input.value, 'utf8').toString('base64'),
          description: input.description,
          disable_previous: input.disablePrevious ?? false,
        },
      )
    },

    async accessLatestValue(secretId: string): Promise<string> {
      const response = await scwFetch<AccessSecretVersionResponse>(
        auth,
        'GET',
        `${SECRET_MANAGER_BASE}/regions/${options.region}/secrets/${secretId}/versions/latest/access`,
      )
      return Buffer.from(response.data, 'base64').toString('utf8')
    },

    async deleteSecret(secretId: string): Promise<void> {
      await scwSend(auth, 'DELETE', `${SECRET_MANAGER_BASE}/regions/${options.region}/secrets/${secretId}`)
    },
  }
}