import { DownloadIcon } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import useDownloader from 'react-use-downloader';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { getFileIcon } from '~/modules/attachment/file-placeholder';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { Spinner } from '~/modules/common/spinner';
import { Button } from '~/modules/ui/button';
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
}

/**
 * Pure presentational component for rendering attachments.
 * Expects a valid URL - URL resolution should happen at a higher level.
 */
export const AttachmentRender = ({
  url,
  type,
  filename,
  altName,
  showButtons,
  imagePanZoom = false,
  itemClassName,
  containerClassName,
  onPanStateToggle,
}: AttachmentRenderProps) => {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm');
  const { download, isInProgress } = useDownloader();

  if (!url) return <Spinner className="mt-[45vh] h-12 w-12" />;

  return (
    <div className={containerClassName}>
      <Suspense fallback={<Spinner className="mt-[45vh]" />}>
        {type.includes('image') &&
          (imagePanZoom && !isMobile ? (
            <ReactPanZoom
              image={url}
              alt={altName}
              onPanStateToggle={onPanStateToggle}
              imageClassName={itemClassName}
              showButtons={showButtons}
            />
          ) : (
            <img src={url} alt={altName} className={`${itemClassName} h-full w-full`} />
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
};
