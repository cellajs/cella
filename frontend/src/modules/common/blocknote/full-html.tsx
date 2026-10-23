import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/styles.css';
import '~/modules/common/blocknote/custom-elements/checklist/checklist-styles.css';

import DOMPurify from 'dompurify';
import { type MouseEventHandler, useEffect, useRef, useState } from 'react';
import type { MediaRefContext } from 'shared/utils/media-ref';
import { childNodes, isDocumentNode, isRefusedMediaBlock } from 'shared/utils/validate-block-media-urls';
import { useLatestRef } from '~/hooks/use-latest-ref';
import type { CarouselItemData } from '~/modules/attachment/attachments-carousel';
import { getBlockPendingUpload, subscribePendingUploads } from '~/modules/attachment/helpers/pending-uploads';
import { resolveBlockNoteFileRef } from '~/modules/attachment/helpers/resolve-url';
import { customSchema } from '~/modules/common/blocknote/blocknote-schema';
import { findClickedMediaBlockId, getHeadlessEditor, getParsedContent } from '~/modules/common/blocknote/helpers/blocknote-helpers';
import { openMediaCarousel } from '~/modules/common/blocknote/helpers/open-attachment';
import { type CommonBlockNoteProps, type CustomBlock, isMediaBlock } from '~/modules/common/blocknote/types';
import { cn } from '~/utils/cn';

// DOMPurify's default URI policy strips `blob:`, which this render needs for locally cached images; all other schemes keep the default.
const allowedUriRegexp = /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

/**
 * First-pass HTML (media refs unresolved) per organization and document. It lays out like the resolved pass (aspect-ratio
 * media boxes), so a cache hit paints the document at full height in the first commit, as row-measuring lists need.
 */
const firstPassHtmlCache = new Map<string, string>();
const firstPassCacheMax = 300;

/** Which media a document may show depends on its organization, so the cache keys on both. */
const firstPassKey = (document: string, organizationId?: string) => `${organizationId ?? ''}:${document}`;

const cacheFirstPass = (key: string, html: string) => {
  if (firstPassHtmlCache.size >= firstPassCacheMax) {
    const oldest = firstPassHtmlCache.keys().next().value;
    if (oldest !== undefined) firstPassHtmlCache.delete(oldest);
  }
  firstPassHtmlCache.set(key, html);
};

/** Whether the editor's schema has a block type: blocksToFullHTML throws on any other. Own keys only, never `toString`. */
const isSchemaBlockType = (type: string) => Object.hasOwn(customSchema.blockSchema, type);

/**
 * The blocks the static render shows, walked as the media validator walks them. A media block the validator
 * refuses renders nothing, in either pass, and neither does a node without a string type or with a type outside
 * the editor's schema: each is dropped and its nested blocks take its place. A list item that is no object is
 * skipped, and a document that is no list shows nothing.
 */
const renderableBlocks = (nodes: unknown, ctx: MediaRefContext): CustomBlock[] =>
  Array.isArray(nodes)
    ? nodes.flatMap((node) => {
        if (!isDocumentNode(node)) return [];
        const children = renderableBlocks(childNodes(node), ctx);
        if (typeof node.type !== 'string' || !isSchemaBlockType(node.type) || isRefusedMediaBlock(node, ctx)) {
          return children;
        }
        // A node of a schema type keeps its own shape; BlockNote reads it as the block it names.
        return [{ ...node, children } as CustomBlock];
      })
    : [];

/**
 * A document's HTML, or null when BlockNote still cannot render it (an unknown inline node or style, content of the
 * wrong shape): that document shows nothing, and no other document fails with it.
 */
const toFullHtml = (blocks: CustomBlock[]): string | null => {
  try {
    return getHeadlessEditor().blocksToFullHTML(blocks);
  } catch {
    return null;
  }
};

/**
 * Computes a document's first-pass HTML into the cache ahead of render, so the component's first commit is synchronous; never
 * throws, so one document cannot stop a batch. It calls blocksToFullHTML (flushSync): never during React render or commit.
 */
export function precomputeDocumentHtml(document: string, organizationId?: string): void {
  const key = firstPassKey(document, organizationId);
  if (firstPassHtmlCache.has(key)) return;
  const blocks = getParsedContent(document);
  if (!blocks) return;
  cacheFirstPass(key, toFullHtml(renderableBlocks(blocks, { organizationId })) ?? '');
}

interface BlockNoteFullHtmlProps extends Pick<CommonBlockNoteProps, 'id' | 'className' | 'dense' | 'clickOpensPreview'> {
  defaultValue: string;
  /**
   * Lays the document out as inline text, so what follows it (a badge, a button) stays on its last line: for a one-block summary.
   * The surrounding block then sets the line height.
   */
  inline?: boolean;
  /** Needed to resolve private (id-referenced) inline media via presigned URLs. */
  tenantId?: string;
  organizationId?: string;
  /** Fires once per mount, when the document's HTML is first computed: for an empty document too. */
  onReady?: () => void;
}

async function resolveMediaBlocks(
  blocks: CustomBlock[],
  resolveUrl: (key: string) => Promise<string>,
): Promise<{ resolved: CustomBlock[]; mediaItems: CarouselItemData[] }> {
  const mediaItems: CarouselItemData[] = [];

  async function walk(blocks: CustomBlock[]): Promise<CustomBlock[]> {
    const walked = await Promise.all(
      blocks.map(async (block): Promise<CustomBlock[]> => {
        let props = block.props;
        const children = block.children?.length ? await walk(block.children) : block.children;

        // renderableBlocks ran first: a media block here holds a props object.
        if (isMediaBlock(block) && block.props.url) {
          const resolvedUrl = await resolveUrl(block.props.url);

          if (resolvedUrl) {
            props = { ...props, url: resolvedUrl };
            mediaItems.push({ id: block.id, url: resolvedUrl, filename: block.props.name, contentType: block.type });
          } else if (!getBlockPendingUpload(props)) {
            // A gone or denied file renders nothing, as a refused ref does; a pending one keeps its ref for the placeholder.
            return children;
          }
        }

        return [{ ...block, props, children } as CustomBlock];
      }),
    );
    return walked.flat();
  }

  const resolved = await walk(blocks);
  return { resolved, mediaItems };
}

export function BlockNoteFullHtml({
  id,
  defaultValue,
  className,
  dense = false,
  inline = false,
  clickOpensPreview = false,
  tenantId,
  organizationId,
  onReady,
}: BlockNoteFullHtmlProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // `ready` once a first pass is computed, an empty one included: an empty document has nothing to wait for.
  const [renderState, setRenderState] = useState<{ html: string; mediaItems: CarouselItemData[]; ready: boolean }>(() => {
    const cached = firstPassHtmlCache.get(firstPassKey(defaultValue, organizationId));
    return { html: cached ?? '', mediaItems: [], ready: cached !== undefined };
  });

  // Bumped when a pending upload's file arrives, so the resolved pass swaps its placeholder for the file.
  const [uploadsArrived, setUploadsArrived] = useState(0);
  useEffect(() => subscribePendingUploads(() => setUploadsArrived((count) => count + 1)), []);

  const onReadyRef = useLatestRef(onReady);
  const readyFiredRef = useRef(false);
  useEffect(() => {
    if (renderState.ready && !readyFiredRef.current) {
      readyFiredRef.current = true;
      onReadyRef.current?.();
    }
  }, [renderState.ready, onReadyRef]);

  // blocksToFullHTML calls flushSync, which cannot run during render or commit, so useEffect plus queueMicrotask keeps it outside both.
  useEffect(() => {
    const parsed = getParsedContent(defaultValue);
    if (!parsed) {
      setRenderState({ html: '', mediaItems: [], ready: true });
      return;
    }
    const blocks = renderableBlocks(parsed, { organizationId });
    const cacheKey = firstPassKey(defaultValue, organizationId);

    let cancelled = false;

    const cached = firstPassHtmlCache.get(cacheKey);
    if (cached !== undefined) {
      // Covers defaultValue changes after mount; on first mount the initializer already painted it.
      setRenderState((prev) => (prev.html === cached && prev.ready ? prev : { html: cached, mediaItems: [], ready: true }));
    } else {
      queueMicrotask(() => {
        if (cancelled) return;
        const html = toFullHtml(blocks) ?? '';
        cacheFirstPass(cacheKey, html);
        setRenderState({ html, mediaItems: [], ready: true });
      });
    }

    async function resolveUrls(blocks: CustomBlock[]) {
      const resolveUrl = (ref: string): Promise<string> => resolveBlockNoteFileRef(ref, { tenantId, organizationId });

      const { resolved, mediaItems } = await resolveMediaBlocks(blocks, resolveUrl);
      if (cancelled) return;

      setRenderState({ html: toFullHtml(resolved) ?? '', mediaItems, ready: true });
    }

    resolveUrls(blocks);
    return () => {
      cancelled = true;
    };
  }, [defaultValue, tenantId, organizationId, uploadsArrived]);

  const handleClick: MouseEventHandler = (event) => {
    if (!clickOpensPreview || renderState.mediaItems.length === 0) return;

    const blockId = findClickedMediaBlockId(event.target);
    if (!blockId) return;

    event.preventDefault();
    openMediaCarousel(renderState.mediaItems, blockId, containerRef);
  };

  // Not `.bn-editor`: BlockNote's side-menu plugin scans those nodes and expects editor-only children such as `.bn-block-group`.
  return (
    <div
      id={id}
      ref={containerRef}
      role="presentation"
      className={cn('bn-container bn-shadcn', dense && 'bn-dense', inline && 'bn-inline', className)}
      onClick={handleClick}
    >
      <div
        // select-text opts this content back into text selection inside the focusable, click-to-expand Card.
        className="bn-static-editor bn-default-styles select-text"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: input is sanitized via DOMPurify before render
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderState.html, { ALLOWED_URI_REGEXP: allowedUriRegexp }) }}
      />
    </div>
  );
}
