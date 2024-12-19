import { Suspense, lazy } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import Spinner from '../common/spinner';

// Lazy-loaded components
const ReactPanZoom = lazy(() => import('~/modules/attachments/image-viewer'));
const RenderAudio = lazy(() => import('~/modules/attachments/render-audio'));
const RenderPDF = lazy(() => import('~/modules/attachments/render-pdf'));
const RenderVideo = lazy(() => import('~/modules/attachments/render-video'));

interface AttachmentRenderProps {
  type: string;
  source: string;
  altName?: string;
  imagePanZoom?: boolean;
  showButtons?: boolean;
  itemClassName?: string;
  containerClassName?: string;
  togglePanState?: boolean;
}

export const AttachmentRender = ({
  source,
  type,
  altName,
  showButtons,
  imagePanZoom = false,
  itemClassName,
  containerClassName,
  togglePanState,
}: AttachmentRenderProps) => {
  const isMobile = useBreakpoints('max', 'sm');

  return (
    <div className={containerClassName}>
      <Suspense fallback={<Spinner />}>
        {type.includes('image') &&
          (imagePanZoom && !isMobile ? (
            <ReactPanZoom image={source} alt={altName} togglePanState={togglePanState} imageClass={itemClassName} showButtons={showButtons} />
          ) : (
            <img src={source} alt={altName} className={`${itemClassName} w-full h-full`} />
          ))}
        {type.includes('audio') && <RenderAudio src={source} />}
        {type.includes('video') && <RenderVideo src={source} />}
        {type.includes('pdf') && <RenderPDF file={source} />}
      </Suspense>
    </div>
  );
};
