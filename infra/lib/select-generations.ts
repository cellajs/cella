import type { GenerationPlane, ServiceRollout } from './stack/control-store'

/** A content-addressed VM generation a stack provisions. */
export interface Generation {
  /** Content-addressed generation id (resource suffix). */
  id: string
  /** Image SHA baked into this generation. */
  sha: string
}

export interface SelectGenerationsOptions {
  /** Replacement strategy: an exclusive service provisions one VM at a time. */
  exclusive: boolean
  /** Plane the selecting stack provisions VMs on. */
  plane: GenerationPlane
  /** Whether the selecting stack provisions PENDING generations (the deploy
   *  target plane; false for a foundation-scope update under micro). */
  pendingOwned: boolean
  /** Content-addressed id for a sha under the service's current fingerprint. */
  genIdFor: (sha: string) => string
}

/**
 * The generations one stack owns for one service, deduplicated by ID. The first
 * entry is the binding target; equal active/pending IDs collapse to one VM. An
 * active generation belongs to the plane recorded on its control pointer
 * (absent = foundation), a pending one to the deploy's target plane, so a
 * topology switch keeps the still-serving plane's VMs until the reap updates
 * both planes. Pure over the control entry; unit-tested in isolation.
 */
export function selectGenerations(entry: ServiceRollout | undefined, opts: SelectGenerationsOptions): Generation[] {
  const activeRef = entry?.active
  const pending: Generation | undefined =
    opts.pendingOwned && entry?.pendingSha ? { id: opts.genIdFor(entry.pendingSha), sha: entry.pendingSha } : undefined
  const active: Generation | undefined =
    activeRef && (activeRef.plane ?? 'foundation') === opts.plane ? { id: activeRef.id, sha: activeRef.sha } : undefined

  const generations: Generation[] = []
  const seen = new Set<string>()
  const add = (g?: Generation) => {
    if (g && !seen.has(g.id)) {
      seen.add(g.id)
      generations.push(g)
    }
  }

  // First provision, before any deploy initializes the control object: a single
  // default generation on the target plane.
  const fallback = () => {
    if (generations.length === 0 && opts.pendingOwned && !entry?.active) add({ id: opts.genIdFor('latest'), sha: 'latest' })
  }

  // Provision only the selected generation for exclusive services such as CDC:
  // the replacement happens within one stack update, never as an overlap.
  if (opts.exclusive) {
    add(pending ?? active)
    fallback()
    return generations
  }

  // Live binding target first: the active generation, or the pending one on a
  // first deploy that has no active yet.
  add(active ?? pending)
  add(pending)
  fallback()
  return generations
}
