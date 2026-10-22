import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import i18n from 'i18next';
import { Suspense } from 'react';
import type { Attachment } from 'sdk';
import { hierarchy, isChannel } from 'shared';
import { attachmentsCanonicalOptions, useAttachmentUpdateMutation } from '~/modules/attachment/query';
import { LazyCollaborativeBlockNote } from '~/modules/common/blocknote/lazy-collaborative-blocknote';
import { BlockNoteFullHtml } from '~/modules/common/blocknote/lazy-full-html';
import { useDescriptionUpdate } from '~/modules/common/blocknote/use-description-update';
import { sheeter, type TriggerRef } from '~/modules/common/sheeter/use-sheeter';
import type { EnrichedChannel } from '~/modules/entities/types';
import { useResolveCan } from '~/modules/entities/use-resolve-can';
import { membersListQueryOptions } from '~/modules/memberships/query';
import type { Member } from '~/modules/memberships/types';
import { findInCache } from '~/query/basic/find-in-list-cache';
import { flattenInfiniteData } from '~/query/basic/flatten';
import { cn } from '~/utils/cn';
import { isTouchInteraction } from '~/utils/input-modality';
import { tw } from '~/utils/tw';

const sheetId = 'attachment-description';

/**
 * Collaborative description editor for one attachment. Grants and the mention audience come
 * from the row's home channel (deepest ancestor, organization for org-homed rows), so an app that
 * re-homes attachments below the organization needs no change here. Read-only without update
 * permission; the relay persists collaborative sessions, the update mutation the editor of an app
 * with Yjs off.
 */
function AttachmentDescriptionForm({ attachment: openedRow }: { attachment: Attachment }) {
  const { tenantId, organizationId } = openedRow;
  // The sheet content is built once, so the row is read live: the editor and the save compare with the stored text.
  const { data: liveRow } = useQuery({
    ...attachmentsCanonicalOptions({ tenantId, organizationId }),
    select: ({ items }) => items.find((item) => item.id === openedRow.id),
  });
  const attachment = liveRow ?? openedRow;
  const [deepest] = hierarchy.resolveNonNullAncestors('attachment', attachment);
  const home = deepest && isChannel(deepest.type) ? { id: deepest.id, type: deepest.type } : null;
  const homeId = home?.id ?? organizationId;
  const homeType = home?.type ?? 'organization';

  const resolveCan = useResolveCan();
  const channel = findInCache<EnrichedChannel>(homeType, homeId);
  // The map is the home channel's own, so the row is at home for a home-scoped grant.
  const canEdit = resolveCan(channel?.can?.attachment?.update, attachment.createdBy, { row: homeId, channel: homeId });

  const membersQuery = useInfiniteQuery(membersListQueryOptions({ entityId: homeId, entityType: homeType, tenantId, organizationId }));
  const members = flattenInfiniteData<Member>(membersQuery.data);

  const { mutateAsync } = useAttachmentUpdateMutation(tenantId, organizationId);
  const updateData = useDescriptionUpdate('attachment', attachment, (ops) => mutateAsync({ id: attachment.id, ops }));

  // The stored description wherever no live editor is. Faded and inert while the relay syncs: the live
  // editor replaces it at the same height, so the swap does not reflow. Without a description the box
  // only holds the height.
  const waitingFallback = (
    <div className={cn('min-h-40', canEdit && 'pointer-events-none select-none opacity-50')}>
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
        tenantId={tenantId}
        organizationId={organizationId}
        canEdit={canEdit}
        editable={canEdit}
        description={attachment.description}
        updateData={updateData}
        members={members}
        autoFocus={canEdit && !isTouchInteraction()}
        waitingFallback={waitingFallback}
        className="min-h-40"
      />
    </Suspense>
  );
}

/** Opens the description editor in a sheet; the same entry point for the table column and the dialog caption. */
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
      title: attachment.name,
      description: i18n.t('c:attachment_description.text'),
    },
  );
}
