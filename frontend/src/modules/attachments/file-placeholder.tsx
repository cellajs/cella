import { File, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo } from 'lucide-react';

const contentTypeMap = [
  { match: ['image'], Icon: FileImage },
  { match: ['video'], Icon: FileVideo },
  { match: ['pdf'], Icon: FileText },
  { match: ['audio'], Icon: FileAudio },
  { match: ['csv', 'xslx'], Icon: FileSpreadsheet },
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
      const { Icon } = found;
      return <Icon {...iconProps} />;
    }
  }

  return <File size={iconSize} />;
};

export default FilePlaceholder;
