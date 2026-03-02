import {
  FileArchiveIcon,
  FileAudioIcon,
  FileIcon,
  FileImageIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileVideoIcon,
} from 'lucide-react';

const contentTypeMap = [
  { match: ['image'], icon: FileImageIcon },
  { match: ['video'], icon: FileVideoIcon },
  { match: ['pdf', 'msword', 'vnd', 'text'], icon: FileTextIcon },
  { match: ['audio'], icon: FileAudioIcon },
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
  iconSize?: number;
  strokeWidth?: number;
  className?: string;
}

export function FilePlaceholder({ contentType, iconSize = 20, strokeWidth = 1.5, className }: Props) {
  const Icon = getFileIcon(contentType);
  return <Icon size={iconSize} strokeWidth={strokeWidth} className={className} />;
}
