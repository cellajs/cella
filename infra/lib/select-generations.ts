import type { ServiceRollout } from './stack/control-store';

/** A content-addressed VM generation the stack provisions. */
export interface Generation {
  /** Content-addressed generation id (resource suffix). */
  id: string;
  /** Image SHA baked into this generation. */
  sha: string;
  /** True for a generation already live in the control state: its VM carries `ignoreChanges` on cloud-init and image, and needs no resolvable registry image. */
  preexisting?: boolean;
}

export interface SelectGenerationsOptions {
  /** Replacement strategy: an exclusive service provisions one VM at a time. */
  exclusive: boolean;
  /** Content-addressed id for a sha under the service's current fingerprint. */
  genIdFor: (sha: string) => string;
}

/** Generations the stack provisions for one service, deduplicated by id. The first entry is the binding target, and equal active/pending ids collapse to one VM. */
export function selectGenerations(entry: ServiceRollout | undefined, opts: SelectGenerationsOptions): Generation[] {
  const activeRef = entry?.active;
  const pending: Generation | undefined = entry?.pendingSha
    ? { id: opts.genIdFor(entry.pendingSha), sha: entry.pendingSha }
    : undefined;
  const active: Generation | undefined = activeRef
    ? { id: activeRef.id, sha: activeRef.sha, preexisting: true }
    : undefined;

  const generations: Generation[] = [];
  const seen = new Set<string>();
  const add = (g?: Generation) => {
    if (g && !seen.has(g.id)) {
      seen.add(g.id);
      generations.push(g);
    }
  };

  // First provision, before any deploy initializes the control object: one default generation.
  const fallback = () => {
    if (generations.length === 0) add({ id: opts.genIdFor('latest'), sha: 'latest' });
  };

  // Exclusive services provision only the selected generation: replacement happens within one stack update, never as an overlap.
  if (opts.exclusive) {
    add(pending ?? active);
    fallback();
    return generations;
  }

  // Live binding target first: the active generation, or the pending one on a first deploy.
  add(active ?? pending);
  add(pending);
  fallback();
  return generations;
}
