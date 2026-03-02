import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/styles.css';

import { BlockNoteEditor } from '@blocknote/core';
import { type MouseEventHandler, useEffect, useRef, useState } from 'react';
import type { CarouselItemData } from '~/modules/attachment/carousel';
import { attachmentStorage } from '~/modules/attachment/dexie/storage-service';
import { openAttachmentDialog } from '~/modules/attachment/dialog/helpers';
import { getFileUrl } from '~/modules/attachment/helpers';
import { findAttachmentInListCache } from '~/modules/attachment/query';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import { getParsedContent } from '~/modules/common/blocknote/helpers';
import type { CustomBlock } from '~/modules/common/blocknote/types';
import { useUIStore } from '~/store/ui';

interface BlockNoteStaticViewProps {
  id: string;
  defaultValue: string;
  className?: string;
  dense?: boolean;
  clickOpensPreview?: boolean;
  publicFiles?: boolean;
}

// File block types that have a url prop
const fileBlockTypes = new Set(['image', 'video', 'audio', 'file']);

/**
 * Walk the block tree, resolve file URLs, and collect media items.
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

function BlockNoteStaticView({
  id,
  defaultValue,
  className = '',
  dense = false,
  clickOpensPreview = false,
  publicFiles = false,
}: BlockNoteStaticViewProps) {
  const mode = useUIStore((state) => state.mode);
  const containerRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState('');
  const [mediaItems, setMediaItems] = useState<CarouselItemData[]>([]);

  useEffect(() => {
    const blocks = getParsedContent(defaultValue);
    if (!blocks) {
      setHtml('');
      return;
    }

    let cancelled = false;

    async function render(blocks: CustomBlock[]) {
      const resolveUrl = async (key: string): Promise<string> => {
        if (!key.length) return '';

        const isAttachmentId = !key.includes('/');
        if (isAttachmentId) {
          const localResult = await attachmentStorage.createBlobUrlWithVariant(key, 'converted', true);
          if (localResult) return localResult.url;
        }

        const cachedAttachment = isAttachmentId ? findAttachmentInListCache(key) : null;
        const tenantId = cachedAttachment?.tenantId;
        const organizationId = cachedAttachment?.organizationId;

        if (!tenantId || !organizationId) return key;
        return getFileUrl(key, publicFiles, tenantId, organizationId);
      };

      const { resolved, media } = await processBlocks(blocks, resolveUrl);
      if (cancelled) return;

      const editor = BlockNoteEditor.create({ schema: customSchema, _headless: true });
      setHtml(editor.blocksToFullHTML(resolved));
      setMediaItems(media);
    }

    render(blocks);
    return () => {
      cancelled = true;
    };
  }, [defaultValue, publicFiles]);

  const handleClick: MouseEventHandler = (event) => {
    if (!clickOpensPreview || mediaItems.length === 0) return;

    const target = event.target as HTMLElement;
    const mediaElement = target.closest('img, video, audio');
    if (!mediaElement) return;

    event.preventDefault();
    const clickedSrc = (mediaElement as HTMLMediaElement).src;
    const attachmentIndex = Math.max(
      0,
      mediaItems.findIndex(({ url }) => url === clickedSrc),
    );

    openAttachmentDialog({
      attachmentIndex,
      attachments: mediaItems,
      triggerRef: containerRef as React.RefObject<null>,
    });
  };

  return (
    <div
      id={id}
      ref={containerRef}
      className={`bn-container bn-shadcn ${dense ? 'bn-dense' : ''} ${mode === 'dark' ? 'dark' : ''} ${className}`}
      data-color-scheme={mode}
      onClick={handleClick}
    >
      <div className="bn-editor bn-default-styles" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

export default BlockNoteStaticView;
