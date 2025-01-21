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

  // Use either remote URL or local URL
  const url = useMemo(() => {
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
        {type.includes('audio') && <RenderAudio src={url} />}
        {type.includes('video') && <RenderVideo src={url} />}
        {type.includes('pdf') && <RenderPDF file={url} />}
      </Suspense>
    </div>
  );
};
