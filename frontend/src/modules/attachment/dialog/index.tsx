import { t } from 'i18next';
import { FlameKindlingIcon } from 'lucide-react';
import AttachmentsCarousel, { CarouselItemData } from '~/modules/attachment/carousel';
import CloseButton from '~/modules/common/close-button';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { Button } from '~/modules/ui/button';

interface AttachmentDialogProps {
  attachmentId: string;
  attachments: CarouselItemData[];
}

function AttachmentDialog({ attachmentId, attachments }: AttachmentDialogProps) {
  const index = attachments.findIndex(({ id }) => id === attachmentId);
  const itemIndex = index === -1 ? 0 : index;
  const removeDialog = useDialoger((state) => state.remove);

  if (!attachments.length) {
    return (
      <>
        <div className="fixed z-10 top-0 left-0 w-full flex gap-2 p-3 bg-background/60 backdrop-blur-xs">
          <div className="grow" />
          <CloseButton onClick={() => removeDialog()} size="lg" className="-my-1" />
        </div>
        <ContentPlaceholder icon={FlameKindlingIcon} title="error:not_found.text">
          <Button variant="secondary" onClick={() => removeDialog()}>
            {t('common:close')}
          </Button>
        </ContentPlaceholder>
      </>
    );
  }

  return (
    <div className="flex flex-wrap relative -z-1 h-screen justify-center p-2 grow">
      <AttachmentsCarousel items={attachments} isDialog itemIndex={itemIndex} saveInSearchParams={true} />
    </div>
  );
}

export default AttachmentDialog;
