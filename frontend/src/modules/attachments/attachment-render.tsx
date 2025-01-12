import DOMPurify from 'dompurify';
import { Suspense, lazy } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import Spinner from '../common/spinner';

// Lazy-loaded components
const ReactPanZoom = lazy(() => import('~/modules/attachments/render-image'));
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
  const sanitizedSource = DOMPurify.sanitize(source);

  return (
    <div className={containerClassName}>
      <Suspense fallback={<Spinner />}>
        {type.includes('image') &&
          (imagePanZoom && !isMobile ? (
            <ReactPanZoom
              image={sanitizedSource}
              alt={altName}
              togglePanState={togglePanState}
              imageClass={itemClassName}
              showButtons={showButtons}
            />
          ) : (
            <img src={sanitizedSource} alt={altName} className={`${itemClassName} w-full h-full`} />
          ))}
        {type.includes('audio') && <RenderAudio src={sanitizedSource} />}
        {type.includes('video') && <RenderVideo src={sanitizedSource} />}
        {type.includes('pdf') && <RenderPDF file={sanitizedSource} />}
      </Suspense>
    </div>
  );
};
