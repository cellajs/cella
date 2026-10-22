import type { PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Spinner } from '~/modules/common/spinner';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import '~/modules/attachment/render/react-pdf.css';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const options = { cMapUrl: '/cmaps/' };

// Centered over the viewer stage, where the Suspense fallback before it stood.
const loadingSpinner = (
  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
    <Spinner size="lg" noDelay />
  </div>
);

const pagePadding = 20; // Breathing room around each page (px)

/** Fits each page to the container width; the pages scroll vertically. */
interface RenderPDFProps {
  file: string;
  className?: string;
}

export function RenderPDF({ file, className }: RenderPDFProps) {
  const [pageWidths, setPageWidths] = useState<number[]>([]);
  const [containerWidth, setContainerWidth] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    setContainerWidth(node.clientWidth);
    const resizeObserver = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));

    resizeObserver.observe(node);

    return () => resizeObserver.disconnect();
  }, []);

  // Each page's own width, so landscape, A4, legal and mixed-orientation pages each fit.
  const handleDocumentLoad = async (pdf: PDFDocumentProxy) => {
    const widths = await Promise.all(
      Array.from({ length: pdf.numPages }, async (_, i) => (await pdf.getPage(i + 1)).getViewport({ scale: 1 }).width),
    );
    setPageWidths(widths);
  };

  const availableWidth = containerWidth - pagePadding;

  return (
    <div ref={containerRef} className={className}>
      <Document file={file} options={options} loading={loadingSpinner} onLoadSuccess={handleDocumentLoad}>
        {availableWidth > 0 &&
          pageWidths.map((width, index) => (
            <Page
              // biome-ignore lint/suspicious/noArrayIndexKey: PDF page numbers are stable and ordered.
              key={`page_${index + 1}`}
              pageNumber={index + 1}
              scale={availableWidth / width}
              devicePixelRatio={window.devicePixelRatio}
            />
          ))}
      </Document>
    </div>
  );
}
