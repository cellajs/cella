import manifest from './seed-assets.json' with { type: 'json' };

/**
 * Bucket prefix of the published seed asset set. Objects under a published prefix never change:
 * a changed set ships under the next version so older checkouts keep resolving their rows.
 */
export const seedAssetsPrefix = 'seed/v1';

/** One seeded attachment, as `pnpm seed:assets` writes it from `seeds/assets/<basename>/<variant>.<ext>`. */
export interface SeedAsset {
  filename: string;
  contentType: string;
  /** MIME type of the `converted` variant, null when the asset folder has none. */
  convertedContentType: string | null;
  /** Byte size of `original`, a string like the attachments column. */
  size: string;
  keys: { original: string; thumbnail?: string; preview?: string; converted?: string };
}

export const seedAssets: SeedAsset[] = manifest;
