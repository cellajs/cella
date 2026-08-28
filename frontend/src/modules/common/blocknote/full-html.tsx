import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/styles.css';
import '~/modules/common/blocknote/custom-elements/checklist/checklist-styles.css';

import DOMPurify from 'dompurify';
import { type MouseEventHandler, useEffect, useRef, useState } from 'react';
import { mediaBlockTypes } from 'shared/blocknote';
import type { CarouselItemData } from '~/modules/attachment/attachments-carousel';
import { openAttachmentDialog } from '~/modules/attachment/dialog/open-attachment-dialog';
import { resolveBlockNoteFileRef } from '~/modules/attachment/helpers/resolve-url';
import {
  findClickedMedia,
  getHeadlessEditor,
  getParsedContent,
} from '~/modules/common/blocknote/helpers/blocknote-helpers';
import type { CustomBlock } from '~/modules/common/blocknote/types';
import { useUIStore } from '~/modules/ui/ui-store';

// DOMPurify's default URI policy strips `blob:`, which this render needs for locally cached images; all other schemes keep the default.
const ALLOWED_URI_REGEXP =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

/**
 * First-pass HTML (unresolved media refs) per document string. Layout-identical to the resolved pass
 * (media boxes are reserved via aspect-ratio), so a cache hit lets the first commit paint the document
 * at full height synchronously; lists that measure rows (virtualizers) see the real height at once.
 */
const firstPassHtmlCache = new Map<string, string>();
const FIRST_PASS_CACHE_MAX = 300;

const cacheFirstPass = (document: string, html: string) => {
  if (firstPassHtmlCache.size >= FIRST_PASS_CACHE_MAX) {
    const oldest = firstPassHtmlCache.keys().next().value;
    if (oldest !== undefined) firstPassHtmlCache.delete(oldest);
  }
  firstPassHtmlCache.set(document, html);
};

/**
 * Computes a document's first-pass HTML into the cache ahead of render, so the component's first
 * commit is synchronous. Calls blocksToFullHTML (flushSync inside): never call during React render
 * or commit; an effect's async continuation is safe.
 */
export function precomputeDocumentHtml(document: string): void {
  if (firstPassHtmlCache.has(document)) return;
  const blocks = getParsedContent(document);
  if (!blocks) return;
  cacheFirstPass(document, getHeadlessEditor().blocksToFullHTML(blocks));
}

interface BlockNoteFullHtmlProps {
  id: string;
  defaultValue: string;
  className?: string;
  dense?: boolean;
  clickOpensPreview?: boolean;
  /** Needed to resolve private (id-referenced) inline media via presigned URLs. */
  tenantId?: string;
  organizationId?: string;
  /** Fires once when the description HTML has been computed (first non-empty paint). */
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

        if (mediaBlockTypes.has(block.type) && 'url' in props && props.url) {
          const rawUrl = props.url as string;
          const resolvedUrl = await resolveUrl(rawUrl);
          props = { ...props, url: resolvedUrl };

          media.push({
            id: block.id,
            url: resolvedUrl,
            filename: ('name' in props ? (props.name as string) : '') || '',
            contentType: block.type,
          });
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
  clickOpensPreview = false,
  tenantId: propTenantId,
  organizationId: propOrganizationId,
  onReady,
}: BlockNoteFullHtmlProps) {
  const mode = useUIStore((state) => state.mode);
  const containerRef = useRef<HTMLDivElement>(null);

  const [renderState, setRenderState] = useState<{ html: string; mediaItems: CarouselItemData[] }>(() => ({
    // A precomputed first pass paints the document at full height in the first commit (no pop-in).
    html: firstPassHtmlCache.get(defaultValue) ?? '',
    mediaItems: [],
  }));

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const readyFiredRef = useRef(false);
  useEffect(() => {
    if (renderState.html && !readyFiredRef.current) {
      readyFiredRef.current = true;
      onReadyRef.current?.();
    }
  }, [renderState.html]);

  // blocksToFullHTML calls flushSync, which cannot run during render or commit, so useEffect plus queueMicrotask keeps it outside both.
  useEffect(() => {
    const blocks = getParsedContent(defaultValue);
    if (!blocks) {
      setRenderState({ html: '', mediaItems: [] });
      return;
    }

    let cancelled = false;

    const cached = firstPassHtmlCache.get(defaultValue);
    if (cached !== undefined) {
      // Covers defaultValue changes after mount; on first mount the initializer already painted it.
      setRenderState((prev) => (prev.html === cached ? prev : { html: cached, mediaItems: [] }));
    } else {
      queueMicrotask(() => {
        if (cancelled) return;
        const html = getHeadlessEditor().blocksToFullHTML(blocks);
        cacheFirstPass(defaultValue, html);
        setRenderState({ html, mediaItems: [] });
      });
    }

    async function resolveUrls(blocks: CustomBlock[]) {
      const resolveUrl = (ref: string): Promise<string> =>
        resolveBlockNoteFileRef(ref, { tenantId: propTenantId, organizationId: propOrganizationId });

      const { resolved, media } = await processBlocks(blocks, resolveUrl);
      if (cancelled) return;

      setRenderState({ html: getHeadlessEditor().blocksToFullHTML(resolved), mediaItems: media });
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

    openAttachmentDialog({
      attachmentIndex,
      attachments: renderState.mediaItems,
      triggerRef: containerRef as React.RefObject<null>,
    });
  };

  // Not `.bn-editor`: BlockNote's side-menu plugin scans those nodes and expects editor-only children such as `.bn-block-group`.
  return (
    <div
      id={id}
      ref={containerRef}
      role="presentation"
      className={`bn-container bn-shadcn ${dense ? 'bn-dense' : ''} ${mode === 'dark' ? 'dark' : ''} ${className}`}
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
