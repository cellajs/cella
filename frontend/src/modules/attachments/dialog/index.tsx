import { FlameKindlingIcon } from 'lucide-react';
import { useMemo } from 'react';
import AttachmentsCarousel, { CarouselItemData } from '~/modules/attachments/carousel';
import ContentPlaceholder from '~/modules/common/content-placeholder';

interface AttachmentDialogProps {
  attachmentId: string;
  attachments: CarouselItemData[];
}

const AttachmentDialog = ({ attachmentId, attachments }: AttachmentDialogProps) => {
  const itemIndex = useMemo(() => {
    const index = attachments.findIndex(({ id }) => id === attachmentId);
    return index === -1 ? 0 : index;
  }, [attachmentId, attachments]);

  return attachments.length ? (
    <div className="flex flex-wrap relative -z-1 h-screen justify-center p-2 grow">
      <AttachmentsCarousel items={attachments} isDialog itemIndex={itemIndex} saveInSearchParams={true} />
    </div>
  ) : (
    <ContentPlaceholder icon={FlameKindlingIcon} title="error:not_found.text" />
  );
};

export default AttachmentDialog;
