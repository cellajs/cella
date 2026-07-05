import { chmod, writeFile } from 'node:fs/promises'
import { isEnvFileDeliverable } from '../../lib/env-file'
import { type FetchLike, resolveFetch } from '../../lib/fetch-like'
import { parseJsonBody } from '../../lib/json'
import type { RuntimeSecretManifestEntry } from './plan'

export interface HydrateRuntimeSecretsOptions {
  manifest: readonly RuntimeSecretManifestEntry[]
  secretKey: string
  region: string
  outputPath: string
  fetchImpl?: FetchLike
}

async function readSecret(opts: HydrateRuntimeSecretsOptions, entry: RuntimeSecretManifestEntry): Promise<string | null> {
  const fetchImpl = resolveFetch(opts.fetchImpl)
  // Manifest ids are `region/uuid` (Pulumi) or a bare uuid; take the last segment
  // and refuse to build a request URL from a blank id.
  const secretId = entry.secretId.split('/').at(-1)
  if (!secretId) throw new Error(`${entry.envVar}: manifest entry has a blank secretId ('${entry.secretId}')`)
  const url = `https://api.scaleway.com/secret-manager/v1beta1/regions/${opts.region}/secrets/${secretId}/versions/latest/access`
  const res = await fetchImpl(url, { method: 'GET', headers: { 'X-Auth-Token': opts.secretKey } })
  const body = await res.text()
  if (res.status === 404) return null
  if (!res.ok) {
    if (!entry.required) return null
    throw new Error(`${entry.envVar}: ${res.status}`)
  }
  const { data } = parseJsonBody<{ data?: string }>(body)
  return Buffer.from(data ?? '', 'base64').toString('utf-8')
}

export async function hydrateRuntimeSecrets(opts: HydrateRuntimeSecretsOptions): Promise<void> {
  const lines: string[] = []
  const errors: string[] = []

  for (const entry of opts.manifest) {
    const value = await readSecret(opts, entry)
    if (value === null) {
      if (entry.required) errors.push(`${entry.envVar}: missing`)
      continue
    }
    const deliverable = isEnvFileDeliverable(value)
    if (!deliverable.ok) {
      errors.push(`${entry.envVar}: ${deliverable.reason}`)
      continue
    }
    lines.push(`${entry.envVar}=${value}`)
  }

  if (errors.length > 0) throw new Error(`runtime-secret-sync failed: ${errors.join(', ')}`)
  await writeFile(opts.outputPath, lines.length > 0 ? `${lines.join('\n')}\n` : '', 'utf-8')
  await chmod(opts.outputPath, 0o600)
}
