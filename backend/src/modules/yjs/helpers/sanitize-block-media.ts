import type { MediaRefContext } from 'shared/utils/media-ref';
import { findRefusedMediaBlocks } from 'shared/utils/validate-block-media-urls';

/**
 * Blanks media references the media grammar refuses before the relay persists description content. Client PUTs reject
 * them outright, but relay writes must stay persistable, and a blank `url` prop holds no reference.
 * @param ctx - the document's organization, whose upload prefix storage keys must lie under.
 */
export function sanitizeBlockMediaUrls(
  description: string,
  ctx: MediaRefContext,
): {
  description: string;
  sanitized: boolean;
  invalidUrls: string[];
} {
  let blocks: unknown;
  try {
    blocks = JSON.parse(description);
  } catch {
    blocks = undefined;
  }
  // Persist an empty document when the content is not a block list and cannot be sanitized.
  if (!Array.isArray(blocks)) return { description: '[]', sanitized: true, invalidUrls: ['[invalid block structure]'] };

  const refused = findRefusedMediaBlocks(blocks, ctx);
  if (refused.length === 0) return { description, sanitized: false, invalidUrls: [] };

  for (const { props } of refused) props.url = '';
  return { description: JSON.stringify(blocks), sanitized: true, invalidUrls: refused.map(({ url }) => url) };
}
