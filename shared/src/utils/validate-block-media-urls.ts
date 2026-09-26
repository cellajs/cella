import { type MediaRefContext, parseMediaRef } from './media-ref.ts';
import { isPropsObject, mediaBlockTypes } from './text-from-block.ts';

/**
 * Whether a media block's `url` prop may be stored and rendered: absent or blank (no file yet), or a string the media
 * grammar accepts. A non-string never passes, since a renderer would coerce it to a URL.
 */
export const isAcceptedMediaUrl = (url: unknown, ctx: MediaRefContext): boolean =>
  url === undefined || url === '' || (typeof url === 'string' && parseMediaRef(url, ctx).kind !== 'invalid');

/** A node of a stored document, which is client input: any object, whatever its `type`, `props` or `children`. */
export type DocumentNode = { type?: unknown; props?: unknown; children?: unknown };

/** Whether a list item of a stored document is a node; every walk skips one that is not. */
export const isDocumentNode = (value: unknown): value is DocumentNode =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The nodes every walk descends into: `children` when it is a list, whatever the node's own type. */
export const childNodes = (node: DocumentNode): unknown[] => (Array.isArray(node.children) ? node.children : []);

/**
 * Whether a node is a media block (image, video, audio, file) that may not render: its props is not an object, or its
 * `url` is one the media grammar refuses for the document's organization. The validator refuses such a block, the relay
 * blanks it and the renderer drops it.
 */
export const isRefusedMediaBlock = (node: DocumentNode, ctx: MediaRefContext): boolean =>
  typeof node.type === 'string' &&
  mediaBlockTypes.has(node.type) &&
  !(isPropsObject(node.props) && isAcceptedMediaUrl(node.props.url, ctx));

/** A refused media block, to blank in place with {@link blankMediaReference}, and its reference for reports. */
interface RefusedMediaBlock {
  block: DocumentNode;
  url: string;
}

const reportedReference = (node: DocumentNode): string => {
  if (!isPropsObject(node.props)) return '[invalid props]';
  const { url } = node.props;
  return typeof url === 'string' ? url : JSON.stringify(url);
};

/**
 * Media blocks, which load their `url` when rendered, that {@link isRefusedMediaBlock} refuses, depth-first through the
 * children of every node. Inline link hrefs are left alone because they need a click.
 */
export const findRefusedMediaBlocks = (blocks: unknown[], ctx: MediaRefContext): RefusedMediaBlock[] => {
  const refused: RefusedMediaBlock[] = [];

  for (const node of blocks) {
    if (!isDocumentNode(node)) continue;
    if (isRefusedMediaBlock(node, ctx)) refused.push({ block: node, url: reportedReference(node) });
    refused.push(...findRefusedMediaBlocks(childNodes(node), ctx));
  }

  return refused;
};

/** Blanks a refused media block's reference in place: a blank `url` holds none, and props that were no object become one. */
export const blankMediaReference = ({ block }: RefusedMediaBlock): void => {
  block.props = { ...(isPropsObject(block.props) ? block.props : {}), url: '' };
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
