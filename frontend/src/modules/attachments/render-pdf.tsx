import { Document, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

const options = { cMapUrl: '/cmaps/' };

type PDFFile = string | File | null;

export default function RenderPDF({ file, className }: { file: PDFFile; className?: string }) {
  // const [numPages, setNumPages] = useState<number>();

  return (
    <Document file={file} options={options} className={className}>
      {/* {Array.from(new Array(numPages), (_el, index) => (
        <Page key={`page_${index + 1}`} pageNumber={index + 1} />
      ))} */}
    </Document>
  );
}
