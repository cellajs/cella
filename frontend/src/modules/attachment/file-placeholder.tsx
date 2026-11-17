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
import { type FileKindName, fileKindOf } from 'shared/utils/file-kind';
import type { TKey } from '~/lib/i18n-locales';
import type { IconComponent } from '~/modules/common/icons/types';

interface FileKind {
  icon: IconComponent;
  /** The word for this kind of file, such as "Spreadsheet". */
  label: TKey;
}

const fileKinds: Record<FileKindName, FileKind> = {
  spreadsheet: { icon: FileSpreadsheetIcon, label: 'c:file_kind_spreadsheet' },
  presentation: { icon: PresentationIcon, label: 'c:file_kind_presentation' },
  archive: { icon: FileArchiveIcon, label: 'c:file_kind_archive' },
  image: { icon: FileImageIcon, label: 'c:image' },
  video: { icon: FilePlayIcon, label: 'c:video' },
  audio: { icon: FileHeadphoneIcon, label: 'c:audio' },
  json: { icon: FileBracesIcon, label: 'c:file_kind_json' },
  pdf: { icon: FileTextIcon, label: 'c:file_kind_pdf' },
  document: { icon: FileTextIcon, label: 'c:file_kind_document' },
  text: { icon: FileTextIcon, label: 'c:file_kind_text' },
  file: { icon: FileIcon, label: 'c:file' },
};

/** The icon and word of a file's kind, from its content type; a plain file for an unknown or absent one. */
export const getFileKind = (contentType?: string): FileKind => fileKinds[fileKindOf(contentType)];

/** The icon and word of a kind of file. */
export const fileKindView = (kind: FileKindName): FileKind => fileKinds[kind];

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
