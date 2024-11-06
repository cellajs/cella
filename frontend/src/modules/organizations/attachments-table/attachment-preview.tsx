import { File, FileAudio, FileText, FileVideo } from 'lucide-react';
import type React from 'react';

interface AttachmentPreviewIconProps {
  url: string;
  contentType: string;
  name: string;
  openCarouselDialog: () => void;
}

const AttachmentPreviewIcon = ({ url, contentType, name, openCarouselDialog }: AttachmentPreviewIconProps) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    openCarouselDialog();
  };

  const renderAttachmentPreviewIcon = (iconSize = 20) => {
    if (contentType.includes('image')) return <img src={url} alt={name} className="h-8 w-8 rounded-md" loading="lazy" />;

    if (contentType.includes('video')) return <FileVideo size={iconSize} />;
    if (contentType.includes('pdf')) return <FileText size={iconSize} />;
    if (contentType.includes('audio')) return <FileAudio size={iconSize} />;

    return <File size={iconSize} />;
  };

  return (
    <div onClick={openCarouselDialog} onKeyDown={handleKeyDown} className="cursor-pointer w-full flex justify-center items-center">
      {renderAttachmentPreviewIcon()}
    </div>
  );
};

export default AttachmentPreviewIcon;
