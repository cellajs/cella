import { AudioPreview } from '~/modules/common/attachments/audio-preview';
import PreviewPDF from '~/modules/common/attachments/pdf-preview';
import { VideoPreview } from '~/modules/common/attachments/video-preview';
import ReactPanZoom from '~/modules/common/image-viewer';

interface AttachmentItemProps {
  type: string;
  source: string;
  altName?: string;
  imagePanZoom?: boolean;
  showButtons?: boolean;
  itemClassName?: string;
  containerClassName?: string;
  togglePanState?: boolean;
}

export const AttachmentItem = ({
  source,
  type,
  altName,
  showButtons,
  imagePanZoom = false,
  itemClassName,
  containerClassName,
  togglePanState,
}: AttachmentItemProps) => {
  return (
    <div className={containerClassName}>
      {type.includes('image') &&
        (imagePanZoom ? (
          <ReactPanZoom image={source} alt={altName} togglePanState={togglePanState} imageClass={itemClassName} showButtons={showButtons} />
        ) : (
          <img src={source} alt={altName} className={`${itemClassName} w-full h-full`} />
        ))}
      {type.includes('audio') && <AudioPreview src={source} />}
      {type.includes('video') && <VideoPreview src={source} />}
      {type.includes('pdf') && <PreviewPDF file={source} />}
    </div>
  );
};
