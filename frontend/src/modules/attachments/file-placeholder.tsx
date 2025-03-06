import { File, FileAudio, FileImage, FileText, FileVideo } from 'lucide-react';

interface Props {
  contentType: string | undefined;
  iconSize?: number;
  strokeWidth?: number;
  className?: string;
}

const FilePlaceholder = ({ contentType, iconSize = 20, strokeWidth = 1.5, className }: Props) => {
  if (!contentType) return <File size={iconSize} />;
  if (contentType.includes('image')) return <FileImage size={iconSize} strokeWidth={strokeWidth} className={className} />;
  if (contentType.includes('video')) return <FileVideo size={iconSize} strokeWidth={strokeWidth} className={className} />;
  if (contentType.includes('pdf')) return <FileText size={iconSize} strokeWidth={strokeWidth} className={className} />;
  if (contentType.includes('audio')) return <FileAudio size={iconSize} strokeWidth={strokeWidth} className={className} />;
  return <File size={iconSize} />;
};

export default FilePlaceholder;
