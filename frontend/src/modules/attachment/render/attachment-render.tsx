import { DownloadIcon } from 'lucide-react';
import type React from 'react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import useDownloader from 'react-use-downloader';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { getFileIcon } from '~/modules/attachment/file-placeholder';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { Spinner } from '~/modules/common/spinner';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { lazyNamed } from '~/utils/lazy-named';

const ReactPanZoom = lazyNamed(() => import('~/modules/attachment/render/image'), 'ReactPanZoom');
const RenderAudio = lazyNamed(() => import('~/modules/attachment/render/audio'), 'RenderAudio');
const RenderPDF = lazyNamed(() => import('~/modules/attachment/render/pdf'), 'RenderPDF');
const RenderVideo = lazyNamed(() => import('~/modules/attachment/render/video'), 'RenderVideo');

interface AttachmentRenderProps {
  type: string;
  url: string;
  /** Used as the save name for non-renderable types (the "download to view" action). */
  filename?: string;
  altName?: string;
  imagePanZoom?: boolean;
  showButtons?: boolean;
  itemClassName?: string;
  containerClassName?: string;
  onPanStateToggle?: (state: boolean) => void;
  /**
   * When set, a click on the empty letterbox around the media dismisses the viewer. Enabling it also
   * sizes the media to its content so that surrounding area is a real click target, not the image box.
   */
  onBackdropClick?: () => void;
}

/**
 * Pure presentational component for rendering attachments.
 * Expects a valid URL - URL resolution should happen at a higher level.
 */
export function AttachmentRender({
  url,
  type,
  filename,
  altName,
  showButtons,
  imagePanZoom = false,
  itemClassName,
  containerClassName,
  onPanStateToggle,
  onBackdropClick,
}: AttachmentRenderProps) {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm');
  const { download, isInProgress } = useDownloader();

  if (!url) return <Spinner className="mt-[45vh] h-12 w-12" />;

  // Only the container itself is the backdrop; clicks on the media or controls bubble here but are
  // ignored by the target check, so just the empty letterbox dismisses the viewer.
  const handleBackdropClick = onBackdropClick
    ? (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onBackdropClick();
      }
    : undefined;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss is a mouse affordance; ESC closes the dialog for keyboard users
    <div className={containerClassName} onClick={handleBackdropClick}>
      <Suspense fallback={<Spinner className="mt-[45vh]" />}>
        {type.includes('image') &&
          (imagePanZoom && !isMobile ? (
            <ReactPanZoom
              image={url}
              alt={altName}
              onPanStateToggle={onPanStateToggle}
              imageClassName={itemClassName}
              showButtons={showButtons}
              backdropDismiss={!!onBackdropClick}
            />
          ) : (
            <img
              src={url}
              alt={altName}
              className={cn(itemClassName, onBackdropClick ? 'max-h-full max-w-full' : 'h-full w-full')}
            />
          ))}
        {type.includes('audio') && <RenderAudio src={url} className="mx-auto -mt-48 h-20 w-[80vw]" />}
        {type.includes('video') && <RenderVideo src={url} className="mx-auto max-h-[90vh] max-w-7xl" />}
        {type.includes('pdf') && (
          <RenderPDF
            file={url}
            fitMode={imagePanZoom ? 'contain' : 'width'}
            className="m-auto mt-12 h-[calc(97vh-3rem)] w-[95vw] max-w-280 overflow-auto"
          />
        )}
        {!['image', 'audio', 'video', 'pdf'].some((k) => type.includes(k)) && (
          <ContentPlaceholder icon={getFileIcon(type)} title="c:download_to_view">
            {/* Actionable: the URL is always fetchable here — a CDN/presigned URL online, or a
                local blob object URL (which also works offline). */}
            <Button
              variant="plain"
              className="mt-4"
              disabled={isInProgress}
              onClick={() => download(url, filename || 'file')}
            >
              {isInProgress ? <Spinner className="size-4" noDelay /> : <DownloadIcon className="size-4" />}
              <span className="ml-1">{t('c:download')}</span>
            </Button>
          </ContentPlaceholder>
        )}
      </Suspense>
    </div>
  );
}
