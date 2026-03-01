import { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import '~/modules/attachment/render/react-pdf.css';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const options = { cMapUrl: '/cmaps/' };

const PDF_NATURAL_WIDTH = 612; // PDF width in points (8.5 inch * 72)

export default function RenderPDF({ file, className }: { file: string; className?: string }) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateScale = (width: number) => {
      if (width > 0) setScale((width - 20) / PDF_NATURAL_WIDTH);
    };

    // Set initial scale immediately
    updateScale(container.clientWidth);

    const resizeObserver = new ResizeObserver(([entry]) => {
      updateScale(entry.contentRect.width);
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className={className}>
      <Document file={file} options={options} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
        {scale != null &&
          Array.from(new Array(numPages || 0), (_el, index) => (
            <Page key={`page_${index + 1}`} pageNumber={index + 1} scale={scale} />
          ))}
      </Document>
    </div>
  );
}
