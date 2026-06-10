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
  fetchImpl?: typeof fetch
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

async function scw<T>(
  fetchImpl: typeof fetch,
  secretKey: string,
  method: string,
  url: string,
  body?: unknown,
): Promise<T> {
  const response = await fetchImpl(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': secretKey,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Scaleway ${method} ${url} → ${response.status}: ${text}`)
  }
  if (response.status === 204 || text === '') return undefined as T
  return JSON.parse(text) as T
}

function buildSecretsUrl(region: string, query: URLSearchParams) {
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  return `${SECRET_MANAGER_BASE}/regions/${region}/secrets${suffix}`
}

export function createSecretManagerClient(options: SecretManagerClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch

  return {
    async listSecrets(path?: string): Promise<SecretManagerSecret[]> {
      const query = new URLSearchParams({
        project_id: options.projectId,
        scheduled_for_deletion: 'false',
      })
      if (path) query.set('path', path)
      const response = await scw<SecretListResponse>(
        fetchImpl,
        options.secretKey,
        'GET',
        buildSecretsUrl(options.region, query),
      )
      return response.secrets
    },

    async getSecretByName(name: string, path: string): Promise<SecretManagerSecret | undefined> {
      const secrets = await this.listSecrets(path)
      return secrets.find((secret) => secret.name === name && secret.path === path)
    },

    async ensureSecret(input: EnsureSecretInput): Promise<SecretManagerSecret> {
      const existing = await this.getSecretByName(input.name, input.path)
      if (existing) return existing

      return await scw<SecretManagerSecret>(
        fetchImpl,
        options.secretKey,
        'POST',
        buildSecretsUrl(options.region, new URLSearchParams()),
        {
          project_id: options.projectId,
          name: input.name,
          path: input.path,
          description: input.description,
          protected: input.protect ?? false,
        },
      )
    },

    async putSecretValue(input: PutSecretValueInput): Promise<void> {
      await scw(
        fetchImpl,
        options.secretKey,
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
      const response = await scw<AccessSecretVersionResponse>(
        fetchImpl,
        options.secretKey,
        'GET',
        `${SECRET_MANAGER_BASE}/regions/${options.region}/secrets/${secretId}/versions/latest/access`,
      )
      return Buffer.from(response.data, 'base64').toString('utf8')
    },

    async deleteSecret(secretId: string): Promise<void> {
      await scw(
        fetchImpl,
        options.secretKey,
        'DELETE',
        `${SECRET_MANAGER_BASE}/regions/${options.region}/secrets/${secretId}`,
      )
    },
  }
}