import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/styles.css';
import '~/modules/common/blocknote/custom-elements/checklist/checklist-styles.css';

import DOMPurify from 'dompurify';
import { type MouseEventHandler, useEffect, useRef, useState } from 'react';
import type { CarouselItemData } from '~/modules/attachment/attachments-carousel';
import { attachmentStorage } from '~/modules/attachment/dexie/storage-service';
import { openAttachmentDialog } from '~/modules/attachment/dialog/helpers';
import { getFileUrl } from '~/modules/attachment/file-url';
import { findAttachmentInCache } from '~/modules/attachment/query';
import { getHeadlessEditor, getParsedContent } from '~/modules/common/blocknote/helpers/blocknote-helpers';
import type { CustomBlock } from '~/modules/common/blocknote/types';
import { useUIStore } from '~/modules/ui/ui-store';

interface BlockNoteFullHtmlProps {
  id: string;
  defaultValue: string;
  className?: string;
  dense?: boolean;
  clickOpensPreview?: boolean;
  publicFiles?: boolean;
  tenantId?: string;
  organizationId?: string;
}

// File block types that have a url prop
const fileBlockTypes = new Set(['image', 'video', 'audio', 'file']);

/**
 * Walk the block tree, resolve file URLs, collect media items, and patch checkbox state.
 */
async function processBlocks(
  blocks: CustomBlock[],
  resolveUrl: (key: string) => Promise<string>,
): Promise<{ resolved: CustomBlock[]; media: CarouselItemData[] }> {
  const media: CarouselItemData[] = [];

  async function walk(blocks: CustomBlock[]): Promise<CustomBlock[]> {
    return Promise.all(
      blocks.map(async (block) => {
        let props = block.props;

        if (fileBlockTypes.has(block.type) && 'url' in props && props.url) {
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
  publicFiles = false,
  tenantId: propTenantId,
  organizationId: propOrganizationId,
}: BlockNoteFullHtmlProps) {
  const mode = useUIStore((state) => state.mode);
  const containerRef = useRef<HTMLDivElement>(null);

  const [renderState, setRenderState] = useState<{ html: string; mediaItems: CarouselItemData[] }>({
    html: '',
    mediaItems: [],
  });

  // blocksToFullHTML internally calls flushSync, which cannot run during render
  // or during React's commit phase (useLayoutEffect). We use useEffect + queueMicrotask
  // to ensure it runs fully outside React's lifecycle.
  useEffect(() => {
    const blocks = getParsedContent(defaultValue);
    if (!blocks) {
      setRenderState({ html: '', mediaItems: [] });
      return;
    }

    let cancelled = false;

    // Produce initial HTML via microtask to escape React's commit phase
    queueMicrotask(() => {
      if (cancelled) return;
      const html = getHeadlessEditor().blocksToFullHTML(blocks);
      setRenderState({ html, mediaItems: [] });
    });

    // Then resolve file URLs asynchronously for the final render
    async function resolveUrls(blocks: CustomBlock[]) {
      const resolveUrl = async (key: string): Promise<string> => {
        if (!key.length) return '';

        const isAttachmentId = !key.includes('/');
        if (isAttachmentId) {
          const localResult = await attachmentStorage.createBlobUrlWithVariant(key, 'converted', true);
          if (localResult) return localResult.url;
        }

        const cachedAttachment = isAttachmentId ? findAttachmentInCache(key) : null;
        const tenantId = cachedAttachment?.tenantId ?? propTenantId;
        const organizationId = cachedAttachment?.organizationId ?? propOrganizationId;

        if (!tenantId || !organizationId) return key;
        return getFileUrl(key, publicFiles, tenantId, organizationId);
      };

      const { resolved, media } = await processBlocks(blocks, resolveUrl);
      if (cancelled) return;

      setRenderState({ html: getHeadlessEditor().blocksToFullHTML(resolved), mediaItems: media });
    }

    resolveUrls(blocks);
    return () => {
      cancelled = true;
    };
  }, [defaultValue, publicFiles]);

  const handleClick: MouseEventHandler = (event) => {
    const target = event.target as HTMLElement;

    if (!clickOpensPreview || renderState.mediaItems.length === 0) return;

    const mediaElement = target.closest('img, video, audio');
    if (!mediaElement) return;

    event.preventDefault();
    const clickedSrc = (mediaElement as HTMLMediaElement).src;
    const attachmentIndex = Math.max(
      0,
      renderState.mediaItems.findIndex(({ url }) => url === clickedSrc),
    );

    openAttachmentDialog({
      attachmentIndex,
      attachments: renderState.mediaItems,
      triggerRef: containerRef as React.RefObject<null>,
    });
  };

  return (
    <div
      id={id}
      ref={containerRef}
      role="presentation"
      className={`bn-container bn-shadcn bn-default-styles ${dense ? 'bn-dense' : ''} ${mode === 'dark' ? 'dark' : ''} ${className}`}
      data-color-scheme={mode}
      onClick={handleClick}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: input is sanitized via DOMPurify before render
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderState.html) }}
    />
  );
}

export default BlockNoteFullHtml;
