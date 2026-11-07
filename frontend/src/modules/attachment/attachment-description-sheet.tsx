import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import i18n from 'i18next';
import { Suspense } from 'react';
import type { Attachment } from 'sdk';
import { hierarchy } from 'shared';
import { attachmentsCanonicalOptions, useAttachmentUpdateMutation } from '~/modules/attachment/query';
import { createDescriptionUpdater } from '~/modules/common/blocknote/description-updater';
import { LazyCollaborativeBlockNote } from '~/modules/common/blocknote/lazy-collaborative-blocknote';
import { BlockNoteFullHtml } from '~/modules/common/blocknote/lazy-full-html';
import { MiddleCut } from '~/modules/common/middle-cut';
import { sheeter, type TriggerRef } from '~/modules/common/sheeter/use-sheeter';
import { useCan } from '~/modules/entities/use-can';
import { membersListQueryOptions } from '~/modules/memberships/query';
import type { Member } from '~/modules/memberships/types';
import { flattenInfiniteData } from '~/query/basic/flatten';
import { cn } from '~/utils/cn';
import { isTouchInteraction } from '~/utils/input-modality';
import { tw } from '~/utils/tw';

const sheetId = 'attachment-description';

interface AttachmentDescriptionFormProps {
  attachment: Attachment;
}

/**
 * Collaborative description editor for one attachment, read-only without update permission. The mention audience comes
 * from the row's home channel (its deepest ancestor), so an app that re-homes attachments needs no change here. The
 * relay saves a collaborative session; with Yjs off, the update mutation saves.
 */
function AttachmentDescriptionForm({ attachment: openedRow }: AttachmentDescriptionFormProps) {
  const { tenantId, organizationId } = openedRow;
  // The sheet content is built once, so the row is read live: the editor and the save compare with the stored text.
  const { data: liveRow } = useQuery({
    ...attachmentsCanonicalOptions({ tenantId, organizationId }),
    select: ({ results }) => results.find((item) => item.id === openedRow.id),
  });
  const attachment = liveRow ?? openedRow;
  const [deepest] = hierarchy.resolveNonNullAncestors('attachment', attachment);
  const homeId = deepest?.id ?? organizationId;
  const homeType = deepest?.type ?? 'organization';

  const canAsMember = useCan({ asMember: true });
  const canEdit = canAsMember('update', 'attachment', attachment);

  const membersQuery = useInfiniteQuery(membersListQueryOptions({ entityId: homeId, entityType: homeType, tenantId, organizationId }));
  const members = flattenInfiniteData<Member>(membersQuery.data);

  const { mutateAsync } = useAttachmentUpdateMutation(tenantId, organizationId);
  const updateData = createDescriptionUpdater('attachment', attachment, (ops) => mutateAsync({ id: attachment.id, ops }));

  // The stored text wherever no live editor is: faded and inert while the relay syncs, at the editor's height so the swap does not reflow.
  const waitingFallback = (
    <div className={cn('min-h-40', canEdit && 'pointer-events-none opacity-50 select-none')}>
      {attachment.description && (
        <Suspense fallback={null}>
          <BlockNoteFullHtml
            id={`blocknote-${attachment.id}-preview`}
            defaultValue={attachment.description}
            tenantId={tenantId}
            organizationId={organizationId}
          />
        </Suspense>
      )}
    </div>
  );

  // The stored description also covers the editor's code loading, so opening the sheet shows one fallback, not two.
  return (
    <Suspense fallback={waitingFallback}>
      <LazyCollaborativeBlockNote
        entityType="attachment"
        entityId={attachment.id}
        editable={canEdit}
        description={attachment.description}
        autoFocus={canEdit && !isTouchInteraction()}
        className="min-h-40"
        {...{ tenantId, organizationId, canEdit, updateData, members, waitingFallback }}
      />
    </Suspense>
  );
}

/** Opens the description editor in a sheet; the form reads the row live, so a cached copy is enough to pass. */
export function openAttachmentDescriptionSheet(attachment: Attachment, triggerRef: TriggerRef) {
  sheeter.getState().create(
    <div className="container sm:pl-8">
      <AttachmentDescriptionForm attachment={attachment} />
    </div>,
    {
      id: sheetId,
      triggerRef,
      side: 'right',
      className: tw('max-w-full lg:max-w-3xl'),
      title: <MiddleCut text={attachment.name} />,
      description: i18n.t('c:attachment_description.text'),
    },
  );
}
