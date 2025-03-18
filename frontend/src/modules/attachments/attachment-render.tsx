import { config } from 'config';
import DOMPurify from 'dompurify';
import { Suspense, lazy, useMemo } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useLocalFile } from '~/modules/attachments/use-local-file';
import Spinner from '~/modules/common/spinner';

// Lazy-loaded components
const ReactPanZoom = lazy(() => import('~/modules/attachments/render-image'));
const RenderAudio = lazy(() => import('~/modules/attachments/render-audio'));
const RenderPDF = lazy(() => import('~/modules/attachments/render-pdf'));
const RenderVideo = lazy(() => import('~/modules/attachments/render-video'));

interface AttachmentRenderProps {
  type: string;
  url: string;
  altName?: string;
  imagePanZoom?: boolean;
  showButtons?: boolean;
  itemClassName?: string;
  containerClassName?: string;
  togglePanState?: (state: boolean) => void;
}

export const AttachmentRender = ({
  url: baseUrl,
  type,
  altName,
  showButtons,
  imagePanZoom = false,
  itemClassName,
  containerClassName,
  togglePanState,
}: AttachmentRenderProps) => {
  const isMobile = useBreakpoints('max', 'sm');

  const sanitizedUrl = DOMPurify.sanitize(baseUrl);
  const { localUrl, localFileError } = useLocalFile(sanitizedUrl, type);

  const url = useMemo(() => {
    // Use direct URL for static images
    if (sanitizedUrl.startsWith('/static/')) return sanitizedUrl;

    // Use either remote URL
    if (sanitizedUrl.startsWith(config.publicCDNUrl)) return sanitizedUrl;

    return localUrl.length ? localUrl : null;
  }, [sanitizedUrl, localUrl]);

  if (sanitizedUrl === localUrl && localFileError) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-background text-muted-foreground">
        <div className="text-center my-8 text-sm text-red-500">{localFileError}</div>
      </div>
    );
  }

  if (!url) return <Spinner className="h-12 w-12 mt-[45vh]" />;

  return (
    <div className={containerClassName}>
      <Suspense fallback={<Spinner className="mt-[45vh]" />}>
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
