import { useEffect, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import '~/modules/attachments/react-pdf.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

const options = { cMapUrl: '/cmaps/' };

export default function RenderPDF({ file, className }: { file: string; className?: string }) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(1); // Scale for fitting the page

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  // Adjust scale based on container width
  const adjustScale = (width: number) => {
    const desiredWidth = width - 60;
    const naturalWidth = 612; // Default PDF page width in points
    setScale(desiredWidth / naturalWidth);
  };

  useEffect(() => {
    const handleResize = () => {
      adjustScale(window.innerWidth - 60);
    };

    // Adjust scale on window resize
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className={className}>
      <Document file={file} options={options} onLoadSuccess={onDocumentLoadSuccess}>
        {Array.from(new Array(numPages || 0), (_el, index) => (
          <Page key={`page_${index + 1}`} pageNumber={index + 1} scale={scale} />
        ))}
      </Document>
    </div>
  );
}
