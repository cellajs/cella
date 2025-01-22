import DOMPurify from 'dompurify';
import { Suspense, lazy, useMemo } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import Spinner from '../common/spinner';
import { useLocalFile } from './use-local-file';

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
  const localUrl = useLocalFile(sanitizedSource, type);

  const url = useMemo(() => {
    // Use direct URL for static images
    if (sanitizedSource.startsWith('/static/')) return sanitizedSource;

    // Use either remote URL or local URL pointing to indedexedDB
    return sanitizedSource.startsWith('http') ? sanitizedSource : localUrl;
  }, [sanitizedSource, localUrl]);

  return (
    <div className={containerClassName}>
      <Suspense fallback={<Spinner />}>
        {type.includes('image') &&
          (imagePanZoom && !isMobile ? (
            <ReactPanZoom image={url} alt={altName} togglePanState={togglePanState} imageClass={itemClassName} showButtons={showButtons} />
          ) : (
            <img src={url} alt={altName} className={`${itemClassName} w-full h-full`} />
          ))}
        {type.includes('audio') && <RenderAudio src={url} className="w-[80vw] mx-auto -mt-48 h-20" />}
        {type.includes('video') && <RenderVideo src={url} className="aspect-video max-h-[90vh] mx-auto" />}
        {type.includes('pdf') && <RenderPDF file={url} className="w-[95vw] m-auto h-[95vh] overflow-auto" />}
      </Suspense>
    </div>
  );
};
