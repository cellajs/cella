import { t } from 'i18next';
import { FlameKindlingIcon } from 'lucide-react';
import AttachmentsCarousel, { type CarouselItemData } from '~/modules/attachment/carousel';
import { useResolvedAttachments } from '~/modules/attachment/hooks/use-resolved-attachments';
import CloseButton from '~/modules/common/close-button';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import Spinner from '~/modules/common/spinner';
import { Button } from '~/modules/ui/button';

/** Input type for dialog - url is optional since it may need resolution */
export type AttachmentDialogItem = Partial<CarouselItemData> & { id: string };

interface AttachmentDialogProps {
  attachmentId: string;
  attachments: AttachmentDialogItem[];
}

/**
 * Attachment dialog that displays a carousel of attachments.
 * Handles URL resolution for items that don't have URLs yet.
 */
function AttachmentDialog({ attachmentId, attachments }: AttachmentDialogProps) {
  const removeDialog = useDialoger((state) => state.remove);

  // Resolve URLs for any items that don't have them
  const { items: resolvedItems, isLoading, hasErrors, errorIds } = useResolvedAttachments(attachments);

  const index = resolvedItems.findIndex(({ id }) => id === attachmentId);
  const itemIndex = index === -1 ? 0 : index;

  // Loading state - still resolving URLs
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner className="h-12 w-12" />
      </div>
    );
  }

  // Error state - attachment not found (not in cache, can't resolve URL)
  if (!resolvedItems.length || (hasErrors && errorIds.includes(attachmentId))) {
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

  // Success state - show carousel with resolved attachments
  return (
    <div className="flex flex-wrap relative -z-1 h-screen justify-center p-2 grow">
      <AttachmentsCarousel items={resolvedItems} isDialog itemIndex={itemIndex} saveInSearchParams={true} />
    </div>
  );
}

export default AttachmentDialog;
