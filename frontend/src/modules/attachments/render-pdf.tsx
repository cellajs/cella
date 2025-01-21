import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import { useState } from 'react';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

const options = { cMapUrl: '/cmaps/' };

type PDFFile = string | File | Blob | null;

export default function RenderPDF({ file, className }: { file: PDFFile; className?: string }) {
  const [numPages, setNumPages] = useState<number | null>(null);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  return (
    <div className={className}>
      <Document file={file} options={options} onLoadSuccess={onDocumentLoadSuccess}>
        {Array.from(new Array(numPages || 0), (_el, index) => (
          <Page key={`page_${index + 1}`} pageNumber={index + 1} />
        ))}
      </Document>
    </div>
  );
}
