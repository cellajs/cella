import {
  FileArchiveIcon,
  FileHeadphoneIcon,
  FileIcon,
  FileImageIcon,
  FilePlayIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
} from 'lucide-react';

const contentTypeMap = [
  { match: ['image'], icon: FileImageIcon },
  { match: ['video'], icon: FilePlayIcon },
  { match: ['pdf', 'msword', 'vnd', 'text'], icon: FileTextIcon },
  { match: ['audio'], icon: FileHeadphoneIcon },
  { match: ['csv', 'xslx'], icon: FileSpreadsheetIcon },
  { match: ['zip', 'rar'], icon: FileArchiveIcon },
];

/** Get the icon component for a content type */
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
  /** Size the icon here (icon-* / size-*); defaults to icon-lg. */
  className?: string;
}

export function FilePlaceholder({ contentType, strokeWidth, className = 'icon-lg' }: Props) {
  const FileIconComponent = getFileIcon(contentType);
  return <FileIconComponent strokeWidth={strokeWidth} className={className} />;
}
