import type { PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import '~/modules/attachment/render/react-pdf.css';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const options = { cMapUrl: '/cmaps/' };

const PAGE_PADDING = 20; // Breathing room around each page (px)

type PageSize = { width: number; height: number };

/**
 * `fitMode` controls how each page is scaled to the container:
 * - `width` (default): fit each page to the container width and scroll vertically. Best for reading
 *   multi-page documents, keeps text large and legible.
 * - `contain`: fit each page fully within the container (width and height), like an image lightbox.
 *   Best for the dialog/carousel where a single page should be visible at a glance, regardless of
 *   orientation (landscape, A4, legal, etc.).
 */
interface RenderPDFProps {
  file: string;
  className?: string;
  fitMode?: 'width' | 'contain';
}

export default function RenderPDF({ file, className, fitMode = 'width' }: RenderPDFProps) {
  const [pageSizes, setPageSizes] = useState<PageSize[]>([]);
  const [container, setContainer] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const update = (width: number, height: number) => setContainer({ width, height });

    // Set initial size immediately
    update(node.clientWidth, node.clientHeight);

    const resizeObserver = new ResizeObserver(([entry]) => {
      update(entry.contentRect.width, entry.contentRect.height);
    });

    resizeObserver.observe(node);

    return () => resizeObserver.disconnect();
  }, []);

  // Read each page's real dimensions instead of assuming a fixed portrait Letter size.
  // This is what makes landscape, A4, legal and mixed-orientation PDFs render naturally.
  const onDocumentLoad = async (pdf: PDFDocumentProxy) => {
    const sizes = await Promise.all(
      Array.from({ length: pdf.numPages }, async (_, i) => {
        const page = await pdf.getPage(i + 1);
        const { width, height } = page.getViewport({ scale: 1 });
        return { width, height };
      }),
    );
    setPageSizes(sizes);
  };

  const getScale = ({ width, height }: PageSize) => {
    const availableWidth = container.width - PAGE_PADDING;
    if (availableWidth <= 0) return null;

    const widthScale = availableWidth / width;
    if (fitMode === 'width') return widthScale;

    const availableHeight = container.height - PAGE_PADDING;
    if (availableHeight <= 0) return widthScale;
    return Math.min(widthScale, availableHeight / height);
  };

  return (
    <div ref={containerRef} className={className}>
      <Document file={file} options={options} onLoadSuccess={onDocumentLoad}>
        {container.width > 0 &&
          pageSizes.map((size, index) => {
            const scale = getScale(size);
            if (scale == null) return null;
            return (
              <Page
                // biome-ignore lint/suspicious/noArrayIndexKey: PDF page numbers are stable and ordered.
                key={`page_${index + 1}`}
                pageNumber={index + 1}
                scale={scale}
                devicePixelRatio={window.devicePixelRatio}
              />
            );
          })}
      </Document>
    </div>
  );
}
