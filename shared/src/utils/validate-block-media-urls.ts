import { type MediaRefContext, parseMediaRef } from './media-ref.ts';
import { mediaBlockTypes } from './text-from-block.ts';

/**
 * Whether a media block's `url` prop may be stored and rendered: absent or blank (no file yet), or a string the media
 * grammar accepts. A non-string never passes, since a renderer would coerce it to a URL.
 */
export const isAcceptedMediaUrl = (url: unknown, ctx: MediaRefContext): boolean =>
  url === undefined || url === '' || (typeof url === 'string' && parseMediaRef(url, ctx).kind !== 'invalid');

interface BlockLike {
  type: string;
  props?: Record<string, unknown>;
  children?: unknown[];
}

const isBlockLike = (value: unknown): value is BlockLike =>
  typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string';

/** A media block whose `url` the grammar refuses: its props object, to blank in place, and the value for reports. */
interface RefusedMediaBlock {
  props: Record<string, unknown>;
  url: string;
}

/**
 * Media blocks (image, video, audio, file), which load their `url` when rendered, whose reference the media grammar
 * refuses for the document's organization, depth-first. Inline link hrefs are left alone because they need a click.
 */
export const findRefusedMediaBlocks = (blocks: unknown[], ctx: MediaRefContext): RefusedMediaBlock[] => {
  const refused: RefusedMediaBlock[] = [];

  for (const block of blocks) {
    if (!isBlockLike(block)) continue;
    const url = block.props?.url;
    if (block.props && mediaBlockTypes.has(block.type) && !isAcceptedMediaUrl(url, ctx)) {
      refused.push({ props: block.props, url: typeof url === 'string' ? url : JSON.stringify(url) });
    }
    if (Array.isArray(block.children)) refused.push(...findRefusedMediaBlocks(block.children, ctx));
  }

  return refused;
};

type ValidationResult = { valid: true } | { valid: false; invalidUrls: string[] };

/** The refused media references of a document, or `valid` when there are none. */
export const validateBlockMediaUrls = (blocks: unknown[], ctx: MediaRefContext): ValidationResult => {
  const invalidUrls = findRefusedMediaBlocks(blocks, ctx).map(({ url }) => url);
  return invalidUrls.length === 0 ? { valid: true } : { valid: false, invalidUrls };
};

/** Whether any media block of a document holds a reference the grammar refuses. */
export const hasUntrustedMediaUrls = (blocks: unknown[], ctx: MediaRefContext): boolean =>
  findRefusedMediaBlocks(blocks, ctx).length > 0;
