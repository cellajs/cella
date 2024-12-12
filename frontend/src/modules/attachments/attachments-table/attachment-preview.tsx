import { File, FileAudio, FileText, FileVideo } from 'lucide-react';
import type React from 'react';

interface AttachmentPreviewProps {
  url: string;
  contentType: string;
  name: string;
  openCarouselDialog: () => void;
}

const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({ url, contentType, name, openCarouselDialog }) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') openCarouselDialog();
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
    <div className="cursor-pointer w-full flex justify-center" onClick={openCarouselDialog} onKeyDown={handleKeyDown} aria-label={`Preview ${name}`}>
      {renderIcon()}
    </div>
  );
};

export default AttachmentPreview;
