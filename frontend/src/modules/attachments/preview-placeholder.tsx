import { File, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo } from 'lucide-react';

const contentTypeMap = [
  { match: ['image'], icon: FileImage },
  { match: ['video'], icon: FileVideo },
  { match: ['pdf'], icon: FileText },
  { match: ['audio'], icon: FileAudio },
  { match: ['csv', 'xslx'], icon: FileSpreadsheet },
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

  return <File size={iconSize} />;
};

export default FilePlaceholder;
