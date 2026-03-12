import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/styles.css';
import '~/modules/common/blocknote/custom-elements/checklist/checklist-styles.css';

import { type MouseEventHandler, useEffect, useRef, useState } from 'react';
import { dispatchCustomEvent } from '~/lib/custom-events';
import type { CarouselItemData } from '~/modules/attachment/carousel';
import { attachmentStorage } from '~/modules/attachment/dexie/storage-service';
import { openAttachmentDialog } from '~/modules/attachment/dialog/helpers';
import { getFileUrl } from '~/modules/attachment/helpers';
import { findAttachmentInListCache } from '~/modules/attachment/query';
import type { CheckboxEntry } from '~/modules/common/blocknote/custom-elements/checklist/checklist-extension';
import {
  getHeadlessEditor,
  getParsedContent,
  setHeadlessCheckboxes,
} from '~/modules/common/blocknote/helpers/blocknote-helpers';
import type { CustomBlock } from '~/modules/common/blocknote/types';
import { useUIStore } from '~/store/ui';

interface BlockNoteFullHtmlProps {
  id: string;
  defaultValue: string;
  checkboxes?: CheckboxEntry[];
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
  checkboxes,
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

  useEffect(() => {
    const blocks = getParsedContent(defaultValue);
    if (!blocks) {
      setRenderState({ html: '', mediaItems: [] });
      return;
    }

    // Build a lookup map for checkbox checked state
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
        const tenantId = cachedAttachment?.tenantId ?? propTenantId;
        const organizationId = cachedAttachment?.organizationId ?? propOrganizationId;

        if (!tenantId || !organizationId) return key;
        return getFileUrl(key, publicFiles, tenantId, organizationId);
      };

      const { resolved, media } = await processBlocks(blocks, resolveUrl);
      if (cancelled) return;

      // Sync checkbox state into the headless editor's extension store before rendering
      setHeadlessCheckboxes(checkboxes ?? []);
      setRenderState({ html: getHeadlessEditor().blocksToFullHTML(resolved), mediaItems: media });
    }

    render(blocks);
    return () => {
      cancelled = true;
    };
  }, [defaultValue, publicFiles, checkboxes]);

  const handleClick: MouseEventHandler = (event) => {
    const target = event.target as HTMLElement;

    // Handle checkbox click via event delegation
    const checkbox = target.closest('input[data-checkbox-id]') as HTMLInputElement | null;
    if (checkbox) {
      const checkboxId = checkbox.dataset.checkboxId;
      if (checkboxId) {
        // Browser already toggled the checkbox before the click bubbles here,
        // so checkbox.checked is the new desired value
        dispatchCustomEvent('toggleCheckbox', { checkboxId, checked: checkbox.checked });
      }
      return;
    }

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
      dangerouslySetInnerHTML={{ __html: renderState.html }}
    />
  );
}

export default BlockNoteFullHtml;
