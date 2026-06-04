import { lazy, Suspense } from 'react';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { getFileIcon } from '~/modules/attachment/file-placeholder';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { Spinner } from '~/modules/common/spinner';

const ReactPanZoom = lazy(() => import('~/modules/attachment/render/image'));
const RenderAudio = lazy(() => import('~/modules/attachment/render/audio'));
const RenderPDF = lazy(() => import('~/modules/attachment/render/pdf'));
const RenderVideo = lazy(() => import('~/modules/attachment/render/video'));

interface AttachmentRenderProps {
  type: string;
  url: string;
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
  altName,
  showButtons,
  imagePanZoom = false,
  itemClassName,
  containerClassName,
  onPanStateToggle,
}: AttachmentRenderProps) => {
  const isMobile = useBreakpointBelow('sm');

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
          <RenderPDF file={url} className="m-auto mt-12 h-[calc(97vh-3rem)] w-[95vw] max-w-280 overflow-auto" />
        )}
        {!['image', 'audio', 'video', 'pdf'].some((k) => type.includes(k)) && (
          <ContentPlaceholder icon={getFileIcon(type)} title="c:download_to_view" />
        )}
      </Suspense>
    </div>
  );
};
