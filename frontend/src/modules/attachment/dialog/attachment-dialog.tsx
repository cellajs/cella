import { useQuery } from '@tanstack/react-query';
import { useMatch, useSearch } from '@tanstack/react-router';
import { t } from 'i18next';
import { FlameKindlingIcon } from 'lucide-react';
import { useState } from 'react';
import { AttachmentsCarousel, headerButtonClass } from '~/modules/attachment/attachments-carousel';
import { attachmentDialogContentClassName, attachmentDialogParam, attachmentGroupParam } from '~/modules/attachment/dialog/params';
import { type ResolvableItem, useResolvedAttachments } from '~/modules/attachment/hooks/use-resolved-attachments';
import { attachmentQueryOptions, useGroupAttachments } from '~/modules/attachment/query';
import { CloseButton } from '~/modules/common/close-button';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { Spinner } from '~/modules/common/spinner';
import { Button } from '~/modules/ui/button';

export function AttachmentDialog() {
  const removeDialog = useDialoger((state) => state.remove);
  // Primitive selects: the match object is rebuilt on every carousel URL write.
  const tenantId = useMatch({ from: '/_app/$tenantId/$organizationSlug', shouldThrow: false, select: (m) => m.params.tenantId });
  const organizationId = useMatch({ from: '/_app/$tenantId/$organizationSlug', shouldThrow: false, select: (m) => m.context.organization?.id });

  const groupId = useSearch({ strict: false, select: (s) => s[attachmentGroupParam] });

  // Capture the initial attachment id once so carousel URL updates cannot re-render this component.
  const [initialAttachmentId] = useState(() => new URLSearchParams(window.location.search).get(attachmentDialogParam) ?? '');

  // Once the carousel has rendered, never fall back to the spinner: Embla and <img> stay mounted across refetches.
  const [carouselShown, setCarouselShown] = useState(false);

  const groupAttachments = useGroupAttachments(tenantId, organizationId, groupId);

  // Covers a page reload where the list cache is not populated when the dialog opens.
  const { data: singleAttachment, isFetching: isFetchingSingle } = useQuery({
    ...attachmentQueryOptions(tenantId ?? '', organizationId ?? '', initialAttachmentId),
    enabled: !!tenantId && !!organizationId && !!initialAttachmentId && !groupAttachments,
  });

  const awaitingContext = !tenantId || !organizationId;

  // Wait for group data: growing from 1 item to N reinits Embla and flashes other slides.
  const awaitingGroup = !!groupId && !groupAttachments;

  const attachments: ResolvableItem[] = groupAttachments ?? [singleAttachment ?? { id: initialAttachmentId }];

  const { items: resolvedItems, isLoading, errorIds } = useResolvedAttachments(attachments);

  const index = resolvedItems.findIndex(({ id }) => id === initialAttachmentId);
  const itemIndex = index === -1 ? 0 : index;

  const blocking = isLoading || awaitingContext || awaitingGroup || isFetchingSingle;
  if (blocking && !carouselShown) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!resolvedItems.length || errorIds.includes(initialAttachmentId)) {
    return (
      <>
        <div className="fixed top-0 left-0 z-20 flex w-full justify-end bg-background/60 p-3 backdrop-blur-xs">
          <CloseButton onClick={() => removeDialog()} className={headerButtonClass} />
        </div>
        <ContentPlaceholder icon={FlameKindlingIcon} title="error:not_found.text">
          <Button variant="secondary" onClick={() => removeDialog()}>
            {t('c:close')}
          </Button>
        </ContentPlaceholder>
      </>
    );
  }

  if (!carouselShown) setCarouselShown(true);
  return (
    <div className={attachmentDialogContentClassName}>
      <AttachmentsCarousel items={resolvedItems} isDialog itemIndex={itemIndex} saveInSearchParams />
    </div>
  );
}
