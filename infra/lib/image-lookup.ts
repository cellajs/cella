/**
 * Look up a baked compute image by name in a zone, via the Scaleway Instance
 * API. Used by the infra CLI to decide whether the first-bootstrap bake prompt
 * is needed (skip it when an image with the configured name already exists) and
 * to validate a re-bake landed.
 *
 * Mirrors the deploy-time resolution in resources/compute.ts, which selects the
 * NEWEST image with `compute.image` as its name — so "exists" here means at
 * least one image with that exact name is present in the zone.
 */

const INSTANCE_BASE = 'https://api.scaleway.com/instance/v1'

/** Minimal fetch surface so the lookup is unit-testable. */
export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{
  ok: boolean
  status: number
  text: () => Promise<string>
}>

interface InstanceImage {
  id: string
  name: string
  /** ISO timestamp; used to pick the newest when several share a name. */
  modification_date?: string
  creation_date?: string
}

export interface ImageLookupOptions {
  secretKey: string
  /** Compute zone, e.g. `nl-ams-1`. Image lookup is zonal. */
  zone: string
  /** Exact image name to match (the `compute.image` value). */
  name: string
  /** Scope to a project; recommended so a shared org can't cause false matches. */
  projectId?: string
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: FetchLike
}

export interface ImageLookupResult {
  /** True when at least one image with the exact name exists in the zone. */
  exists: boolean
  /** The newest matching image, when any. */
  newest?: { id: string; name: string }
  /** Count of images sharing the name. */
  count: number
}

function imageTimestamp(image: InstanceImage): number {
  const raw = image.modification_date ?? image.creation_date
  const ms = raw ? Date.parse(raw) : NaN
  return Number.isNaN(ms) ? 0 : ms
}

/**
 * Find images with an exact name in a zone. The Instance API `name` filter is a
 * prefix/substring match, so results are filtered to an exact-name match here to
 * mirror the provider's `getImage({ name })` exact semantics.
 */
export async function lookupImageByName(opts: ImageLookupOptions): Promise<ImageLookupResult> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  const params = new URLSearchParams({ name: opts.name, page: '1', per_page: '100' })
  if (opts.projectId) params.set('project', opts.projectId)
  const url = `${INSTANCE_BASE}/zones/${opts.zone}/images?${params.toString()}`

  const res = await fetchImpl(url, { method: 'GET', headers: { 'X-Auth-Token': opts.secretKey } })
  const text = await res.text()
  if (!res.ok) throw new Error(`Scaleway GET ${url} → ${res.status}: ${text}`)

  const body = (text === '' ? {} : JSON.parse(text)) as { images?: InstanceImage[] }
  const matches = (body.images ?? []).filter((image) => image.name === opts.name)
  if (matches.length === 0) return { exists: false, count: 0 }

  const newest = matches.reduce((a, b) => (imageTimestamp(b) > imageTimestamp(a) ? b : a))
  return { exists: true, count: matches.length, newest: { id: newest.id, name: newest.name } }
}
