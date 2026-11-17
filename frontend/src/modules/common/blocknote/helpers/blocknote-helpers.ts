import { BlockNoteEditor } from '@blocknote/core';
import { parseBlocks } from 'shared/blocknote';
import { parseMediaRef } from 'shared/utils/media-ref';
import { getPublicFileUrl } from '~/modules/attachment/file-url';
import { customSchema } from '~/modules/common/blocknote/blocknote-schema';
import { checkedExtension } from '~/modules/common/blocknote/custom-elements/checklist/checklist-extension';
import { type CustomBlock, type CustomBlockMediaTypes, isMediaBlock } from '~/modules/common/blocknote/types';

// Shared headless editor singleton avoids expensive BlockNoteEditor.create() on every call.
let headlessEditor: ReturnType<typeof BlockNoteEditor.create> | null = null;
export const getHeadlessEditor = () => {
  if (!headlessEditor) headlessEditor = BlockNoteEditor.create({ schema: customSchema, _headless: true, extensions: [checkedExtension()] });
  return headlessEditor;
};

/** Block id of the media a click in rendered content hit, or null. `includeWrapped` also matches nested media and file blocks without a preview. */
export const findClickedMediaBlockId = (target: EventTarget, { includeWrapped = false } = {}): string | null => {
  if (!(target instanceof Element)) return null;
  const media =
    target.closest('img, video, audio') ??
    (includeWrapped ? (target.querySelector('img, video, audio') ?? target.closest('.bn-file-block-content-wrapper')) : null);
  return media?.closest('[data-id]')?.getAttribute('data-id') ?? null;
};

/** The stored blocks, or undefined for an empty or unparsable string: BlockNote's `initialContent` takes no null. */
export const getParsedContent = (strBlocks: string | null | undefined) => (parseBlocks(strBlocks) as CustomBlock[] | null) ?? undefined;

export const blocksToHTML = (strBlocks: string) => getHeadlessEditor().blocksToHTMLLossy(getParsedContent(strBlocks) ?? []);

type ExportBlock = typeof customSchema.PartialBlock;

/** What a copy writes for a file of the document, by its attachment id: a link that opens it, or null for its name alone. */
export type ExportFileLink = (attachmentId: string) => string | null;

interface ExportOptions {
  /** The document's organization: a storage key under it is a public file, written as its URL. */
  organizationId?: string;
  fileLink?: ExportFileLink;
}

/**
 * A media block as a copy writes it: the image itself only from a URL that serves its bytes, else a link to the file,
 * else its name. A caption follows as a line of its own, which Markdown keeps where it drops a figure's.
 */
const mediaForExport = (block: Extract<CustomBlock, { type: CustomBlockMediaTypes }>, { organizationId, fileLink }: ExportOptions): ExportBlock[] => {
  const ref = parseMediaRef(block.props.url, { organizationId });
  const fileUrl = ref.kind === 'asset' ? ref.url : ref.kind === 'orgKey' ? getPublicFileUrl(ref.key) : null;
  const url = fileUrl ?? (ref.kind === 'attachment' ? fileLink?.(ref.id) : null) ?? '';
  const preview = block.type === 'file' ? {} : { showPreview: block.type === 'image' && !!fileUrl };
  const caption = block.props.caption;
  return [
    { ...block, props: { ...block.props, url, caption: '', ...preview } } as ExportBlock,
    ...(caption ? [{ type: 'paragraph', content: [{ type: 'text', text: caption, styles: { italic: true } }] } as ExportBlock] : []),
  ];
};

const blockForExport = (block: CustomBlock, options: ExportOptions): ExportBlock[] => {
  if (isMediaBlock(block)) return mediaForExport(block, options);
  const children = block.children.flatMap((child) => blockForExport(child, options));
  // BlockNote's own checklist item, which Markdown writes as `- [x]` and HTML as a checkbox in a list
  if (block.type === 'checklistItem') return [{ type: 'checkListItem', props: { checked: block.props.checked }, content: block.content, children }];
  // A Markdown table needs a header row: the first row takes the part
  if (block.type === 'table' && !block.content.headerRows)
    return [{ ...block, content: { ...block.content, headerRows: 1 }, children } as ExportBlock];
  return [{ ...block, children } as ExportBlock];
};

/** Blocks as a copy writes them to other apps: todos as checklist items, files as links, captions and table headers kept. */
export const blocksForExport = (blocks: CustomBlock[], options: ExportOptions = {}): ExportBlock[] =>
  blocks.flatMap((block) => blockForExport(block, options));

/** Writes both HTML (for rich text targets) and Markdown (so code blocks survive in plain-text targets). */
export const writeBlocksToClipboard = async (blocks: ExportBlock[]): Promise<boolean> => {
  try {
    const editor = getHeadlessEditor();
    const html = new Blob([editor.blocksToHTMLLossy(blocks)], { type: 'text/html' });
    const markdown = new Blob([editor.blocksToMarkdownLossy(blocks)], { type: 'text/plain' });
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': html, 'text/plain': markdown })]);
    return true;
  } catch {
    return false;
  }
};

/** Copies a stored document as `blocksForExport` writes it; its files by name alone. */
export const copyBlocksToClipboard = async (strBlocks: string | null): Promise<boolean> => {
  const blocks = getParsedContent(strBlocks);
  return blocks ? writeBlocksToClipboard(blocksForExport(blocks)) : false;
};
