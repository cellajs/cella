import { File, FileAudio, FileImage, FileText, FileVideo } from 'lucide-react';

interface Props {
  fileType: string | undefined;
  iconSize?: number;
  strokeWidth?: number;
  className?: string;
}

const FilePlaceholder = ({ fileType, iconSize = 20, strokeWidth = 1.5, className }: Props) => {
  if (!fileType) return <File size={iconSize} />;
  if (fileType.includes('image')) return <FileImage size={iconSize} strokeWidth={strokeWidth} className={className} />;
  if (fileType.includes('video')) return <FileVideo size={iconSize} strokeWidth={strokeWidth} className={className} />;
  if (fileType.includes('pdf')) return <FileText size={iconSize} strokeWidth={strokeWidth} className={className} />;
  if (fileType.includes('audio')) return <FileAudio size={iconSize} strokeWidth={strokeWidth} className={className} />;
  return <File size={iconSize} />;
};

export default FilePlaceholder;
