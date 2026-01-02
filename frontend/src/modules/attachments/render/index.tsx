import { lazy, Suspense } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import Spinner from '~/modules/common/spinner';

// Lazy-loaded components
const ReactPanZoom = lazy(() => import('~/modules/attachments/render/image'));
const RenderAudio = lazy(() => import('~/modules/attachments/render/audio'));
const RenderPDF = lazy(() => import('~/modules/attachments/render/pdf'));
const RenderVideo = lazy(() => import('~/modules/attachments/render/video'));

interface AttachmentRenderProps {
  id: string;
  type: string;
  url: string;
  altName?: string;
  imagePanZoom?: boolean;
  showButtons?: boolean;
  itemClassName?: string;
  containerClassName?: string;
  onPanStateToggle?: (state: boolean) => void;
}

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
  const isMobile = useBreakpoints('max', 'sm');

  if (!url) return <Spinner className="h-12 w-12 mt-[45vh]" />;

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
            <img src={url} alt={altName} className={`${itemClassName} w-full h-full`} />
          ))}
        {type.includes('audio') && <RenderAudio src={url} className="w-[80vw] mx-auto -mt-48 h-20" />}
        {type.includes('video') && <RenderVideo src={url} className="max-h-[90vh] max-w-7xl mx-auto" />}
        {type.includes('pdf') && (
          <RenderPDF file={url} className="w-[95vw] max-w-280 mt-12 m-auto h-[calc(97vh-3rem)] overflow-auto" />
        )}
      </Suspense>
    </div>
  );
};
