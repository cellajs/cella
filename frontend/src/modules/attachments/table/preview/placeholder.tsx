import { FileArchiveIcon, FileAudioIcon, FileIcon, FileImageIcon, FileSpreadsheetIcon, FileTextIcon, FileVideoIcon } from 'lucide-react';

const contentTypeMap = [
  { match: ['image'], icon: FileImageIcon },
  { match: ['video'], icon: FileVideoIcon },
  { match: ['pdf', 'msword', 'vnd', 'text'], icon: FileTextIcon },
  { match: ['audio'], icon: FileAudioIcon },
  { match: ['csv', 'xslx'], icon: FileSpreadsheetIcon },
  { match: ['zip', 'rar'], icon: FileArchiveIcon },
];

interface Props {
  contentType?: string;
  iconSize?: number;
  strokeWidth?: number;
  className?: string;
}

const FilePlaceholder = ({ contentType, iconSize = 20, strokeWidth = 1.5, className }: Props) => {
  const iconProps = { size: iconSize, strokeWidth, className };

  if (contentType) {
    const found = contentTypeMap.find(({ match }) => match.some((type) => contentType.includes(type)));
    if (found) {
      const { icon: Icon } = found;
      return <Icon {...iconProps} />;
    }
  }

  return <FileIcon size={iconSize} />;
};

export default FilePlaceholder;
