import { validateBlockMediaUrls } from '#/utils/validate-block-urls';

const mediaBlockTypes = new Set(['image', 'video', 'audio', 'file']);

type BlockLike = { type: string; props?: Record<string, unknown>; children?: BlockLike[] };

/**
 * Sanitize untrusted media URLs before the relay persists description content.
 *
 * Client PUTs reject untrusted URLs outright (`assertBlockMediaUrls`), but relay
 * relay writes must remain persistable: a client can inject a bad URL directly into
 * the Y.Doc, and rejecting it would block retries and session-row cleanup. Offending
 * `url` props are blanked because the validator treats blank and non-URL values as
 * trusted internal references. The sanitized content can then be persisted.
 */
export function sanitizeBlockMediaUrls(description: string): {
  description: string;
  sanitized: boolean;
  invalidUrls: string[];
} {
  const result = validateBlockMediaUrls(description);
  if (result.valid) return { description, sanitized: false, invalidUrls: [] };

  const invalidSet = new Set(result.invalidUrls);

  let blocks: BlockLike[];
  try {
    blocks = JSON.parse(description) as BlockLike[];
  } catch {
    // Persist an empty document when malformed JSON cannot be sanitized.
    return { description: '[]', sanitized: true, invalidUrls: result.invalidUrls };
  }

  const strip = (items: BlockLike[]): void => {
    for (const block of items) {
      if (
        mediaBlockTypes.has(block.type) &&
        block.props &&
        typeof block.props.url === 'string' &&
        invalidSet.has(block.props.url)
      ) {
        block.props.url = '';
      }
      if (block.children?.length) strip(block.children);
    }
  };
  strip(blocks);

  return { description: JSON.stringify(blocks), sanitized: true, invalidUrls: result.invalidUrls };
}
