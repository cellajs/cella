import { FileArchiveIcon, FileHeadphoneIcon, FileIcon, FileImageIcon, FilePlayIcon, FileSpreadsheetIcon, FileTextIcon } from 'lucide-react';

/** The first match wins, so every family comes before the document catch-all (`vnd`, `text`). */
const contentTypeMap = [
  { match: ['spreadsheet', 'excel', 'csv'], icon: FileSpreadsheetIcon },
  { match: ['zip', 'rar'], icon: FileArchiveIcon },
  { match: ['image'], icon: FileImageIcon },
  { match: ['video'], icon: FilePlayIcon },
  { match: ['audio'], icon: FileHeadphoneIcon },
  { match: ['pdf', 'msword', 'vnd', 'text'], icon: FileTextIcon },
];

export function getFileIcon(contentType?: string) {
  if (contentType) {
    const found = contentTypeMap.find(({ match }) => match.some((type) => contentType.includes(type)));
    if (found) return found.icon;
  }
  return FileIcon;
}

interface Props {
  contentType?: string;
  strokeWidth?: number;
  /** Size the icon here (icon-* / size-*); defaults to size-5. */
  className?: string;
}

export function FilePlaceholder({ contentType, strokeWidth, className = 'size-5' }: Props) {
  const FileIconComponent = getFileIcon(contentType);
  return <FileIconComponent strokeWidth={strokeWidth} className={className} />;
}
