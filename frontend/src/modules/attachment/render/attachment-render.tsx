import { CloudOffIcon, DownloadIcon } from 'lucide-react';
import type React from 'react';
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useDownloader } from '~/hooks/use-downloader';
import { getFileIcon } from '~/modules/attachment/file-placeholder';
import { type PendingUpload, pendingUploadMessage } from '~/modules/attachment/helpers/pending-uploads';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { Spinner } from '~/modules/common/spinner';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { lazyNamed } from '~/utils/lazy-named';

const ReactPanZoom = lazyNamed(() => import('~/modules/attachment/render/image'), 'ReactPanZoom');
const RenderAudio = lazyNamed(() => import('~/modules/attachment/render/audio'), 'RenderAudio');
const RenderPDF = lazyNamed(() => import('~/modules/attachment/render/pdf'), 'RenderPDF');
const RenderVideo = lazyNamed(() => import('~/modules/attachment/render/video'), 'RenderVideo');

/** The renderers, matched by substring of the content type in this order; any other type gets the download placeholder. */
const renderKinds = ['image', 'audio', 'video', 'pdf'] as const;

interface AttachmentRenderProps {
  type: string;
  url: string;
  pendingUpload?: PendingUpload;
  /** Used as the save name for non-renderable types (the "download to view" action). */
  filename?: string;
  alt?: string;
  imagePanZoom?: boolean;
  showButtons?: boolean;
  itemClassName?: string;
  containerClassName?: string;
  onPanStateToggle?: (state: boolean) => void;
  /** A click on the empty letterbox dismisses the viewer; it also sizes the media to its content so that area is a click target. */
  onBackdropClick?: () => void;
}

/** Presentational only: expects an already-resolved URL. */
export function AttachmentRender({
  url,
  pendingUpload,
  type,
  filename,
  alt,
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

  if (pendingUpload) {
    const { key, params } = pendingUploadMessage(pendingUpload);
    return (
      <div className={containerClassName}>
        <ContentPlaceholder icon={CloudOffIcon} title={key} titleProps={params} />
      </div>
    );
  }

  if (!url) return <Spinner size="lg" className="mt-[45vh]" />;

  const kind = renderKinds.find((renderKind) => type.includes(renderKind));

  // Only the container itself is the backdrop: clicks on media or controls bubble here but fail the target check.
  const handleBackdropClick = onBackdropClick
    ? (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onBackdropClick();
      }
    : undefined;

  const downloadPlaceholder = (
    <ContentPlaceholder icon={getFileIcon(type)} title="c:download_to_view">
      {/* The URL is a CDN or presigned URL online, a local blob URL offline. */}
      <Button variant="plain" className="mt-4" disabled={isInProgress} onClick={() => download(url, filename || 'file')}>
        {isInProgress ? <Spinner size="sm" noDelay /> : <DownloadIcon className="size-4" />}
        <span>{t('c:download')}</span>
      </Button>
    </ContentPlaceholder>
  );

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss is a mouse affordance; ESC closes the dialog for keyboard users
    <div className={containerClassName} onClick={handleBackdropClick}>
      {/* A renderer that cannot load its file throws during render (react-pdf loads through Suspense); this keeps the failure inside the viewer. */}
      <ErrorBoundary fallback={downloadPlaceholder} resetKeys={[url]}>
        <Suspense fallback={<Spinner size="lg" />}>
          {kind === 'image' &&
            (imagePanZoom && !isMobile ? (
              <ReactPanZoom
                image={url}
                alt={alt}
                onPanStateToggle={onPanStateToggle}
                imageClassName={itemClassName}
                showButtons={showButtons}
                backdropDismiss={!!onBackdropClick}
              />
            ) : (
              <img src={url} alt={alt} className={cn(itemClassName, onBackdropClick ? 'max-h-full max-w-full' : 'size-full')} />
            ))}
          {kind === 'audio' && <RenderAudio src={url} className="mx-auto -mt-48 h-20 w-[80vw]" />}
          {kind === 'video' && <RenderVideo src={url} className="mx-auto max-h-full max-w-7xl" />}
          {kind === 'pdf' && <RenderPDF file={url} className="m-auto h-full w-[95vw] max-w-280 overflow-auto" />}
          {!kind && downloadPlaceholder}
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
