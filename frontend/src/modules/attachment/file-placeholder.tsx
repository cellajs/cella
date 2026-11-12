import {
  FileArchiveIcon,
  FileBracesIcon,
  FileHeadphoneIcon,
  FileIcon,
  FileImageIcon,
  FilePlayIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  PresentationIcon,
} from 'lucide-react';
import type { TKey } from '~/lib/i18n-locales';
import type { IconComponent } from '~/modules/common/icons/types';

interface FileKind {
  icon: IconComponent;
  /** The word for this kind of file, such as "Spreadsheet". */
  label: TKey;
}

/** The first match wins, so every family comes before the document catch-all (`vnd`, `text`). */
const fileKinds: (FileKind & { match: string[] })[] = [
  { match: ['spreadsheet', 'excel', 'csv'], icon: FileSpreadsheetIcon, label: 'c:file_kind_spreadsheet' },
  { match: ['presentation', 'powerpoint'], icon: PresentationIcon, label: 'c:file_kind_presentation' },
  { match: ['zip', 'rar'], icon: FileArchiveIcon, label: 'c:file_kind_archive' },
  { match: ['image'], icon: FileImageIcon, label: 'c:image' },
  { match: ['video'], icon: FilePlayIcon, label: 'c:video' },
  { match: ['audio'], icon: FileHeadphoneIcon, label: 'c:audio' },
  { match: ['json'], icon: FileBracesIcon, label: 'c:file_kind_json' },
  { match: ['pdf'], icon: FileTextIcon, label: 'c:file_kind_pdf' },
  { match: ['msword', 'vnd'], icon: FileTextIcon, label: 'c:file_kind_document' },
  { match: ['text'], icon: FileTextIcon, label: 'c:file_kind_text' },
];

const unknownKind: FileKind = { icon: FileIcon, label: 'c:file' };

/** The icon and word of a file's kind, from its content type; a plain file for an unknown or absent one. */
export const getFileKind = (contentType?: string): FileKind =>
  (contentType && fileKinds.find(({ match }) => match.some((type) => contentType.includes(type)))) || unknownKind;

export const getFileIcon = (contentType?: string) => getFileKind(contentType).icon;

/** Whether a file's content reads as text: plain text, Markdown, CSV, JSON. */
export const isTextFile = (contentType?: string) => !!contentType && (contentType.startsWith('text/') || contentType.includes('json'));

interface FilePlaceholderProps {
  contentType?: string;
  strokeWidth?: number;
  className?: string;
}

export function FilePlaceholder({ contentType, strokeWidth, className = 'size-5' }: FilePlaceholderProps) {
  const FileIconComponent = getFileIcon(contentType);
  return <FileIconComponent strokeWidth={strokeWidth} className={className} />;
}
