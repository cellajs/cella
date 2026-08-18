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

/** Dialog input: url is optional because it may still need resolving. */
type AttachmentDialogItem = Partial<CarouselItemData> & { id: string };

export function AttachmentDialog() {
  const removeDialog = useDialoger((state) => state.remove);
  const orgMatch = useMatch({ from: '/_app/$tenantId/$organizationSlug', shouldThrow: false });
  const tenantId = orgMatch?.params?.tenantId;
  const organizationId = orgMatch?.context?.organization?.id;

  const groupId = useSearch({ strict: false, select: (s) => (s as { groupId?: string }).groupId });

  // Capture the initial attachment id once so carousel URL updates cannot re-render this component.
  const initialAttachmentIdRef = useRef<string | null>(null);
  if (initialAttachmentIdRef.current === null) {
    const params = new URLSearchParams(window.location.search);
    initialAttachmentIdRef.current = params.get('attachmentDialogId') ?? '';
  }
  const initialAttachmentId = initialAttachmentIdRef.current;

  // Once the carousel has rendered, never fall back to the spinner: Embla and <img> stay mounted across refetches.
  const hasRenderedRef = useRef(false);

  const groupAttachments = useGroupAttachments(tenantId, organizationId, groupId);

  // Covers a page reload where the list cache is not populated when the dialog opens.
  const { data: singleAttachment, isFetching: isFetchingSingle } = useQuery({
    ...attachmentQueryOptions(tenantId ?? '', organizationId ?? '', initialAttachmentId),
    enabled: !!tenantId && !!organizationId && !!initialAttachmentId && !groupAttachments,
  });

  const awaitingContext = !tenantId || !organizationId;

  // Wait for group data: growing from 1 item to N reinits Embla and flashes other slides.
  const awaitingGroup = !!groupId && !groupAttachments;

  const attachments: AttachmentDialogItem[] = groupAttachments ?? [singleAttachment ?? { id: initialAttachmentId }];

  const { items: resolvedItems, isLoading, hasErrors, errorIds } = useResolvedAttachments(attachments);

  const index = resolvedItems.findIndex(({ id }) => id === initialAttachmentId);
  const itemIndex = index === -1 ? 0 : index;

  const blocking = isLoading || awaitingContext || awaitingGroup || isFetchingSingle;
  if (blocking && !hasRenderedRef.current) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Spinner className="h-12 w-12" />
      </div>
    );
  }

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

  hasRenderedRef.current = true;
  return (
    <div className="relative -z-1 flex h-dvh grow flex-wrap justify-center p-2">
      <AttachmentsCarousel items={resolvedItems} isDialog itemIndex={itemIndex} saveInSearchParams />
    </div>
  );
}
