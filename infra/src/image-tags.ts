/**
 * Image-tag pin validation. Refuses to provision compute with mutable tags
 * (`:latest` or unset) because Pulumi can't detect a registry-side update,
 * so a redeploy would silently keep the old image.
 *
 * Pure — extracted from helpers.ts so it can be unit-tested without a Pulumi
 * runtime. helpers.ts re-uses this function inside its `if (deployCompute)` guard.
 */

/** Returns the list of "infra:<name>" tags that fail the immutability check. */
export function validateImageTags(tags: Record<string, string | undefined>): string[] {
  return Object.entries(tags)
    .filter(([, tag]) => !tag || tag === 'latest')
    .map(([name]) => `infra:${name}`)
}

export class UnpinnedImageError extends Error {
  constructor(public readonly unpinned: string[]) {
    super(
      `Refusing to deploy with unpinned image tags: ${unpinned.join(', ')}. ` +
        `Set each to an immutable tag (git SHA) via 'pulumi config set'.`,
    )
    this.name = 'UnpinnedImageError'
  }
}

/** Validate and throw if any tag fails. Convenience for production callers. */
export function assertPinnedImageTags(tags: Record<string, string | undefined>): void {
  const unpinned = validateImageTags(tags)
  if (unpinned.length > 0) throw new UnpinnedImageError(unpinned)
}
