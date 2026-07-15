import { useQuery } from '@tanstack/react-query';
import { useMatch, useSearch } from '@tanstack/react-router';
import { t } from 'i18next';
import { FlameKindlingIcon } from 'lucide-react';
import { useRef } from 'react';
import { AttachmentsCarousel, type CarouselItemData } from '~/modules/attachment/attachments-carousel';
import { useResolvedAttachments } from '~/modules/attachment/hooks/use-resolved-attachments';
import { attachmentQueryOptions, useGroupAttachments } from '~/modules/attachment/query';
import { CloseButton } from '~/modules/common/close-button';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { Spinner } from '~/modules/common/spinner';
import { Button } from '~/modules/ui/button';

/** Input type for dialog - url is optional since it may need resolution */
type AttachmentDialogItem = Partial<CarouselItemData> & { id: string };

/**
 * Uses selective URL subscriptions to avoid re-renders during carousel navigation, and a reactive
 * query subscription for group attachments to handle post-upload timing.
 */
export function AttachmentDialog() {
  const removeDialog = useDialoger((state) => state.remove);
  const orgMatch = useMatch({ from: '/_app/$tenantId/$organizationSlug', shouldThrow: false });
  const tenantId = orgMatch?.params?.tenantId;
  const organizationId = orgMatch?.context?.organization?.id;

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

  // Tracks whether the carousel has been shown at least once. After that we never fall back to
  // the full-screen spinner, keeping the Embla instance and <img> mounted across refetches.
  const hasRenderedRef = useRef(false);

  // Reactively subscribe to group attachments - re-renders when cache updates
  const groupAttachments = useGroupAttachments(tenantId, organizationId, groupId);

  // Reactively fetch single attachment metadata - handles page reload race condition
  // where the list cache hasn't populated yet when the dialog opens
  const { data: singleAttachment, isFetching: isFetchingSingle } = useQuery({
    ...attachmentQueryOptions(tenantId ?? '', organizationId ?? '', initialAttachmentId),
    enabled: !!tenantId && !!organizationId && !!initialAttachmentId && !groupAttachments,
  });

  // Wait for org context on page reload before showing error state
  const awaitingContext = !tenantId || !organizationId;

  // When groupId is present, wait for group data to avoid a 1→N item transition
  // that causes Embla to reinit and flash other slides
  const awaitingGroup = !!groupId && !groupAttachments;

  // Build items array: use group attachments if available, otherwise single attachment
  const attachments: AttachmentDialogItem[] = groupAttachments ?? [singleAttachment ?? { id: initialAttachmentId }];

  // Resolve URLs for any items that don't have them
  const { items: resolvedItems, isLoading, hasErrors, errorIds } = useResolvedAttachments(attachments);

  const index = resolvedItems.findIndex(({ id }) => id === initialAttachmentId);
  const itemIndex = index === -1 ? 0 : index;

  // Only gate the spinner on the INITIAL load: once mounted we keep the carousel mounted, so a
  // background refetch, transient group-null, or URL re-resolve can't flash it back to a spinner.
  const blocking = isLoading || awaitingContext || awaitingGroup || isFetchingSingle;
  if (blocking && !hasRenderedRef.current) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="h-12 w-12" />
      </div>
    );
  }

  // Error state - attachment not found (not in cache, can't resolve URL)
  if (!resolvedItems.length || (hasErrors && errorIds.includes(initialAttachmentId))) {
    return (
      <>
        <div className="fixed top-0 left-0 z-10 flex w-full gap-2 bg-background/60 p-3 backdrop-blur-xs">
          <div className="grow" />
          <CloseButton onClick={() => removeDialog()} size="lg" className="-my-1" />
        </div>
        <ContentPlaceholder icon={FlameKindlingIcon} title="error:not_found.text">
          <Button variant="secondary" onClick={() => removeDialog()}>
            {t('c:close')}
          </Button>
        </ContentPlaceholder>
      </>
    );
  }

  // Success state - show carousel with resolved attachments
  hasRenderedRef.current = true;
  return (
    <div className="relative -z-1 flex h-screen grow flex-wrap justify-center p-2">
      <AttachmentsCarousel items={resolvedItems} isDialog itemIndex={itemIndex} saveInSearchParams />
    </div>
  );
}
