import { chmod, readFile, writeFile } from 'node:fs/promises'
import { type FetchLike, resolveFetch } from '../../lib/utils/fetch-like'
import { parseJsonBody } from '../../lib/utils/json'
import type { ServiceKeyHandoff } from './plan'

export interface ServiceKeyPair {
  accessKey: string
  secretKey: string
}

export interface FetchServiceKeyOptions {
  handoff: ServiceKeyHandoff
  /** The baked boot key: its ONLY secret reach is the handoff folder. */
  bootSecretKey: string
  region: string
  fetchImpl?: FetchLike
}

function parsePair(raw: string, source: string): ServiceKeyPair {
  const parsed = JSON.parse(raw) as Partial<ServiceKeyPair> | null
  if (typeof parsed?.accessKey !== 'string' || typeof parsed?.secretKey !== 'string') {
    throw new Error(`service-key: ${source} does not contain {accessKey, secretKey}`)
  }
  return { accessKey: parsed.accessKey, secretKey: parsed.secretKey }
}

/**
 * Resolve this generation's service key (v2 model).
 *
 * Cache-first: reboots read the pair persisted at first boot and never touch
 * IAM or Secret Manager again. First boot fetches the single-access handoff
 * bundle exactly once. Scaleway disables the version on that read, so a
 * SECOND reader always fails. A fetch failure with no cache therefore means
 * the bundle was consumed by someone else (or the deploy staged it wrong):
 * that is a SECURITY SIGNAL, not a retryable error. The thrown message is
 * explicit so boot-diag and the deploy surface it as such.
 */
export async function fetchServiceKey(opts: FetchServiceKeyOptions): Promise<ServiceKeyPair> {
  const cached = await readFile(opts.handoff.cacheFile, 'utf-8').catch(() => undefined)
  if (cached !== undefined) return parsePair(cached, `cache ${opts.handoff.cacheFile}`)

  const fetchImpl = resolveFetch(opts.fetchImpl)
  const url = `https://api.scaleway.com/secret-manager/v1beta1/regions/${opts.region}/secrets/${opts.handoff.secretId}/versions/latest/access`
  const res = await fetchImpl(url, { method: 'GET', headers: { 'X-Auth-Token': opts.bootSecretKey } })
  const body = await res.text()
  if (!res.ok) {
    throw new Error(
      `SECURITY: service-key handoff fetch failed (${res.status}) and no cached key exists. ` +
        'The single-access bundle was already consumed or is missing — possible credential interception. ' +
        'Halting boot; investigate before redeploying (a redeploy stages a fresh bundle).',
    )
  }
  const { data } = parseJsonBody<{ data?: string }>(body)
  const pair = parsePair(Buffer.from(data ?? '', 'base64').toString('utf-8'), 'handoff bundle')

  await writeFile(opts.handoff.cacheFile, JSON.stringify(pair), 'utf-8')
  await chmod(opts.handoff.cacheFile, 0o600)
  return pair
}
