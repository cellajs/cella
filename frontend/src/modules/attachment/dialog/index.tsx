import { useParams, useSearch } from '@tanstack/react-router';
import { t } from 'i18next';
import { FlameKindlingIcon } from 'lucide-react';
import { useRef } from 'react';
import { AttachmentsCarousel, type CarouselItemData } from '~/modules/attachment/carousel';
import { useResolvedAttachments } from '~/modules/attachment/hooks/use-resolved-attachments';
import { findAttachmentInListCache, useGroupAttachments } from '~/modules/attachment/query';
import { CloseButton } from '~/modules/common/close-button';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { Spinner } from '~/modules/common/spinner';
import { Button } from '~/modules/ui/button';

/** Input type for dialog - url is optional since it may need resolution */
export type AttachmentDialogItem = Partial<CarouselItemData> & { id: string };

/**
 * Attachment dialog that displays a carousel of attachments.
 * Uses selective URL subscriptions to prevent re-renders during carousel navigation.
 * Uses reactive query subscription for group attachments to handle post-upload timing.
 */
export function AttachmentDialog() {
  const removeDialog = useDialoger((state) => state.remove);
  const { tenantId, orgSlug } = useParams({ strict: false });

  // Only subscribe to groupId changes - this determines which attachments to show
  const groupId = useSearch({ strict: false, select: (s) => (s as { groupId?: string }).groupId });

  // Capture initial attachmentId once - carousel manages position after that
  // This prevents re-renders when carousel navigation updates the URL
  const initialAttachmentIdRef = useRef<string | null>(null);
  if (initialAttachmentIdRef.current === null) {
    const params = new URLSearchParams(window.location.search);
    initialAttachmentIdRef.current = params.get('attachmentDialogId') ?? '';
  }
  const initialAttachmentId = initialAttachmentIdRef.current;

  // Reactively subscribe to group attachments - re-renders when cache updates
  const groupAttachments = useGroupAttachments(tenantId, orgSlug, groupId);

  // Build items array: use group attachments if available, otherwise single attachment
  const attachments: AttachmentDialogItem[] = groupAttachments ?? [
    findAttachmentInListCache(initialAttachmentId) ?? { id: initialAttachmentId },
  ];

  // Resolve URLs for any items that don't have them
  const { items: resolvedItems, isLoading, hasErrors, errorIds } = useResolvedAttachments(attachments);

  const index = resolvedItems.findIndex(({ id }) => id === initialAttachmentId);
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
  if (!resolvedItems.length || (hasErrors && errorIds.includes(initialAttachmentId))) {
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
      <AttachmentsCarousel items={resolvedItems} isDialog itemIndex={itemIndex} saveInSearchParams />
    </div>
  );
}
