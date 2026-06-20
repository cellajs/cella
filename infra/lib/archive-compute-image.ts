/**
 * Archive Scaleway compute images that hold a given stable name, by renaming
 * them out of the way.
 *
 * Why: the Scaleway Packer builder pre-validates the target image name and
 * refuses to create a second image with a name that already exists (there is no
 * force/overwrite flag). But the deploy-time resolver
 * (resources/compute.ts → getImage `latest: true`) is built around a STABLE
 * image name. To reconcile the two, every re-bake frees the stable name by
 * renaming the current image to `<name>-archived-<timestamp>-<id8>`. The old
 * image (and its backing snapshot) is retained, so it stays pinnable by UUID for
 * rollback — renaming is cosmetic and fully reversible, unlike deletion.
 *
 * Uses the Scaleway Instance API directly (same X-Auth-Token pattern as the
 * other lib/ helpers). Read+write on images is covered by the bootstrap key used
 * for baking.
 */
const INSTANCE_BASE = 'https://api.scaleway.com/instance/v1'

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>

export interface ArchiveComputeImagesOptions {
  secretKey: string
  projectId: string
  zone: string
  imageName: string
  fetchImpl?: FetchLike
  now?: () => Date
}

interface ScalewayImage {
  id: string
  name: string
}

function archivedName(imageName: string, id: string, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-').replace('Z', '')
  return `${imageName}-archived-${stamp}-${id.slice(0, 8)}`
}

/**
 * Rename every image with exactly `imageName` (in the given zone/project) to a
 * unique archived name. Returns the list of archived image ids (empty when none
 * existed — e.g. a fresh bootstrap). Throws on any API error so the bake aborts
 * before building rather than failing later on the duplicate-name pre-check.
 */
export async function archiveComputeImagesByName(opts: ArchiveComputeImagesOptions): Promise<string[]> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  const now = (opts.now ?? (() => new Date()))()
  const headers = { 'X-Auth-Token': opts.secretKey, 'Content-Type': 'application/json' }

  // The `name` query filter is a substring match, so archived images (which keep
  // the stable name as a prefix) come back too — page through all results and
  // keep only EXACT-name matches, so accumulated archives can never hide the
  // current stable-named image past the first page.
  const matches: ScalewayImage[] = []
  for (let page = 1; ; page++) {
    const listUrl = `${INSTANCE_BASE}/zones/${opts.zone}/images?project=${encodeURIComponent(opts.projectId)}&name=${encodeURIComponent(opts.imageName)}&per_page=100&page=${page}`
    const listRes = await fetchImpl(listUrl, { method: 'GET', headers })
    const listBody = await listRes.text()
    if (!listRes.ok) throw new Error(`list images failed (${listRes.status}): ${listBody}`)
    const { images = [] } = (listBody === '' ? {} : JSON.parse(listBody)) as { images?: ScalewayImage[] }
    for (const image of images) if (image.name === opts.imageName) matches.push(image)
    if (images.length < 100) break
  }

  const archived: string[] = []
  for (const image of matches) {
    const patchRes = await fetchImpl(`${INSTANCE_BASE}/zones/${opts.zone}/images/${image.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: archivedName(opts.imageName, image.id, now) }),
    })
    if (!patchRes.ok) throw new Error(`rename image ${image.id} failed (${patchRes.status}): ${await patchRes.text()}`)
    archived.push(image.id)
  }
  return archived
}
