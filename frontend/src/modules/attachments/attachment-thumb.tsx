import { File, FileAudio, FileText, FileVideo } from 'lucide-react';
import type React from 'react';

interface AttachmentThumbProps {
  url: string;
  contentType: string;
  name: string;
  openDialog: () => void;
}

const AttachmentThumb: React.FC<AttachmentThumbProps> = ({ url, contentType, name, openDialog }) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') openDialog();
  };

  const renderIcon = (iconSize = 24) => {
    if (contentType.includes('image'))
      return (
        <img
          src={`${url}?width=100&format=avif`}
          draggable="false"
          alt={name}
          className="h-8 w-8 bg-muted rounded-md object-cover"
          loading="lazy"
          decoding="async"
        />
      );

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
