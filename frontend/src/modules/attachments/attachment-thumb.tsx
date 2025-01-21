import { File, FileAudio, FileText, FileVideo } from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';
import { useLocalFile } from './use-local-file';

interface AttachmentThumbProps {
  url: string;
  contentType: string;
  name: string;
  openDialog: () => void;
}

const AttachmentThumb: React.FC<AttachmentThumbProps> = ({ url: baseUrl, contentType, name, openDialog }) => {
  const localUrl = useLocalFile(baseUrl, contentType);

  // Use either remote URL or local URL
  const url = useMemo(() => {
    return baseUrl.startsWith('http') ? `${baseUrl}?width=100&format=avif` : localUrl;
  }, [baseUrl, localUrl]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') openDialog();
  };

  const renderIcon = (iconSize = 24) => {
    if (!url) return;
    if (contentType.includes('image'))
      return <img src={url} draggable="false" alt={name} className="h-8 w-8 bg-muted rounded-md object-cover" loading="lazy" decoding="async" />;
    if (contentType.includes('video')) return <FileVideo size={iconSize} />;
    if (contentType.includes('pdf')) return <FileText size={iconSize} />;
    if (contentType.includes('audio')) return <FileAudio size={iconSize} />;

    return <File size={iconSize} />;
  };

  return (
    <div className="cursor-pointer w-full flex justify-center" onClick={openDialog} onKeyDown={handleKeyDown} aria-label={`Preview ${name}`}>
      {renderIcon()}
    </div>
  );
};

export default AttachmentThumb;
