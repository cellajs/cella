import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/styles.css';
import '~/modules/common/blocknote/custom-elements/checklist/checklist-styles.css';

import DOMPurify from 'dompurify';
import { type MouseEventHandler, useEffect, useRef, useState } from 'react';
import { mediaBlockTypes } from 'shared/blocknote';
import type { MediaRefContext } from 'shared/utils/media-ref';
import { childNodes, isDocumentNode, isRefusedMediaBlock } from 'shared/utils/validate-block-media-urls';
import type { CarouselItemData } from '~/modules/attachment/attachments-carousel';
import { openAttachmentDialog } from '~/modules/attachment/dialog/open-attachment-dialog';
import { resolveBlockNoteFileRef } from '~/modules/attachment/helpers/resolve-url';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import { findClickedMedia, getHeadlessEditor, getParsedContent } from '~/modules/common/blocknote/helpers/blocknote-helpers';
import type { CustomBlock } from '~/modules/common/blocknote/types';
import { useUIStore } from '~/modules/ui/ui-store';
import { cn } from '~/utils/cn';

// DOMPurify's default URI policy strips `blob:`, which this render needs for locally cached images; all other schemes keep the default.
const ALLOWED_URI_REGEXP = /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

/**
 * First-pass HTML (unresolved media refs) per organization and document string. Layout-identical to the
 * resolved pass (media boxes are reserved via aspect-ratio), so a cache hit lets the first commit paint the
 * document at full height synchronously; lists that measure rows (virtualizers) see the real height at once.
 */
const firstPassHtmlCache = new Map<string, string>();
const FIRST_PASS_CACHE_MAX = 300;

/** Which media a document may show depends on its organization, so the cache keys on both. */
const firstPassKey = (document: string, organizationId?: string) => `${organizationId ?? ''}:${document}`;

const cacheFirstPass = (key: string, html: string) => {
  if (firstPassHtmlCache.size >= FIRST_PASS_CACHE_MAX) {
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
 * Computes a document's first-pass HTML into the cache ahead of render, so the component's first
 * commit is synchronous; never throws, so one document cannot stop a batch. Calls blocksToFullHTML
 * (flushSync inside): never call during React render or commit; an effect's async continuation is safe.
 */
export function precomputeDocumentHtml(document: string, organizationId?: string): void {
  const key = firstPassKey(document, organizationId);
  if (firstPassHtmlCache.has(key)) return;
  const blocks = getParsedContent(document);
  if (!blocks) return;
  cacheFirstPass(key, toFullHtml(renderableBlocks(blocks, { organizationId })) ?? '');
}

interface BlockNoteFullHtmlProps {
  id: string;
  defaultValue: string;
  className?: string;
  dense?: boolean;
  /**
   * Lays the document out as inline text, so what follows it (a badge, a button) stays on its last line: for a one-block summary.
   * The surrounding block then sets the line height.
   */
  inline?: boolean;
  clickOpensPreview?: boolean;
  /** Needed to resolve private (id-referenced) inline media via presigned URLs. */
  tenantId?: string;
  organizationId?: string;
  /** Fires once per mount, when the document's HTML is first computed: for an empty document too. */
  onReady?: () => void;
}

async function processBlocks(
  blocks: CustomBlock[],
  resolveUrl: (key: string) => Promise<string>,
): Promise<{ resolved: CustomBlock[]; media: CarouselItemData[] }> {
  const media: CarouselItemData[] = [];

  async function walk(blocks: CustomBlock[]): Promise<CustomBlock[]> {
    return Promise.all(
      blocks.map(async (block) => {
        let props = block.props;

        // renderableBlocks ran first: a media block here holds a props object.
        if (mediaBlockTypes.has(block.type) && 'url' in props && props.url) {
          const rawUrl = props.url as string;
          const resolvedUrl = await resolveUrl(rawUrl);
          props = { ...props, url: resolvedUrl };

          const filename = ('name' in props ? (props.name as string) : '') || '';
          media.push({ id: block.id, url: resolvedUrl, filename, contentType: block.type });
        }

        const children = block.children?.length ? await walk(block.children as CustomBlock[]) : block.children;

        return { ...block, props, children } as CustomBlock;
      }),
    );
  }

  const resolved = await walk(blocks);
  return { resolved, media };
}

function BlockNoteFullHtml({
  id,
  defaultValue,
  className = '',
  dense = false,
  inline = false,
  clickOpensPreview = false,
  tenantId: propTenantId,
  organizationId: propOrganizationId,
  onReady,
}: BlockNoteFullHtmlProps) {
  const mode = useUIStore((state) => state.mode);
  const containerRef = useRef<HTMLDivElement>(null);

  // `ready` once a first pass is computed, an empty one included: an empty document has nothing to wait for.
  const [renderState, setRenderState] = useState<{ html: string; mediaItems: CarouselItemData[]; ready: boolean }>(() => {
    // A precomputed first pass paints the document at full height in the first commit (no pop-in).
    const cached = firstPassHtmlCache.get(firstPassKey(defaultValue, propOrganizationId));
    return { html: cached ?? '', mediaItems: [], ready: cached !== undefined };
  });

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const readyFiredRef = useRef(false);
  useEffect(() => {
    if (renderState.ready && !readyFiredRef.current) {
      readyFiredRef.current = true;
      onReadyRef.current?.();
    }
  }, [renderState.ready]);

  // blocksToFullHTML calls flushSync, which cannot run during render or commit, so useEffect plus queueMicrotask keeps it outside both.
  useEffect(() => {
    const parsed = getParsedContent(defaultValue);
    if (!parsed) {
      setRenderState({ html: '', mediaItems: [], ready: true });
      return;
    }
    const blocks = renderableBlocks(parsed, { organizationId: propOrganizationId });
    const cacheKey = firstPassKey(defaultValue, propOrganizationId);

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
      const resolveUrl = (ref: string): Promise<string> =>
        resolveBlockNoteFileRef(ref, { tenantId: propTenantId, organizationId: propOrganizationId });

      const { resolved, media } = await processBlocks(blocks, resolveUrl);
      if (cancelled) return;

      setRenderState({ html: toFullHtml(resolved) ?? '', mediaItems: media, ready: true });
    }

    resolveUrls(blocks);
    return () => {
      cancelled = true;
    };
  }, [defaultValue, propTenantId, propOrganizationId]);

  const handleClick: MouseEventHandler = (event) => {
    if (!clickOpensPreview || renderState.mediaItems.length === 0) return;

    const media = findClickedMedia(event.target as HTMLElement);
    if (!media) return;

    event.preventDefault();
    const attachmentIndex = Math.max(
      0,
      renderState.mediaItems.findIndex(({ url }) => url === media.src),
    );

    openAttachmentDialog({ attachmentIndex, attachments: renderState.mediaItems, triggerRef: containerRef as React.RefObject<null> });
  };

  // Not `.bn-editor`: BlockNote's side-menu plugin scans those nodes and expects editor-only children such as `.bn-block-group`.
  return (
    <div
      id={id}
      ref={containerRef}
      role="presentation"
      className={cn('bn-container bn-shadcn', dense && 'bn-dense', inline && 'bn-inline', mode === 'dark' && 'dark', className)}
      data-color-scheme={mode}
      onClick={handleClick}
    >
      <div
        // select-text opts this content back into text selection inside the focusable, click-to-expand Card.
        className="bn-static-editor bn-default-styles select-text"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: input is sanitized via DOMPurify before render
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderState.html, { ALLOWED_URI_REGEXP }) }}
      />
    </div>
  );
}

export { BlockNoteFullHtml };
