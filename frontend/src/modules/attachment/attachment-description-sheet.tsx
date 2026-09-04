import { useInfiniteQuery } from '@tanstack/react-query';
import i18n from 'i18next';
import type { Attachment } from 'sdk';
import { hierarchy, isChannel } from 'shared';
import { useAttachmentUpdateMutation } from '~/modules/attachment/query';
import { CollaborativeBlockNote } from '~/modules/common/blocknote/collaborative-blocknote';
import { useDescriptionUpdate } from '~/modules/common/blocknote/use-description-update';
import { type TriggerRef, useSheeter } from '~/modules/common/sheeter/use-sheeter';
import type { EnrichedChannel } from '~/modules/entities/types';
import { useResolveCan } from '~/modules/entities/use-resolve-can';
import { membersListQueryOptions } from '~/modules/memberships/query';
import type { Member } from '~/modules/memberships/types';
import { findInCache } from '~/query/basic/find-in-list-cache';
import { flattenInfiniteData } from '~/query/basic/flatten';

const sheetId = 'attachment-description';

/**
 * Collaborative description editor for one attachment. Grants and the mention audience come
 * from the row's home channel (deepest ancestor, organization for org-homed rows), so an app that
 * re-homes attachments below the organization needs no change here. Read-only without update
 * permission; the relay persists collaborative sessions, the update mutation the standalone fallback.
 */
function AttachmentDescriptionForm({ attachment }: { attachment: Attachment }) {
  const { tenantId, organizationId } = attachment;
  const [deepest] = hierarchy.resolveNonNullAncestors('attachment', attachment);
  const home = deepest && isChannel(deepest.type) ? { id: deepest.id, type: deepest.type } : null;
  const homeId = home?.id ?? organizationId;
  const homeType = home?.type ?? 'organization';

  const resolveCan = useResolveCan();
  const channel = findInCache<EnrichedChannel>(homeType, homeId);
  const canEdit = resolveCan(channel?.can?.attachment?.update, attachment.createdBy);

  const membersQuery = useInfiniteQuery(
    membersListQueryOptions({ entityId: homeId, entityType: homeType, tenantId, organizationId }),
  );
  const members = flattenInfiniteData<Member>(membersQuery.data);

  const { mutateAsync } = useAttachmentUpdateMutation(tenantId, organizationId);
  const updateData = useDescriptionUpdate('attachment', attachment, (ops) => mutateAsync({ id: attachment.id, ops }));

  return (
    <CollaborativeBlockNote
      entityType="attachment"
      entityId={attachment.id}
      tenantId={tenantId}
      canEdit={canEdit}
      editable={canEdit}
      description={attachment.description}
      updateData={updateData}
      members={members}
      autoFocus={canEdit}
      className="min-h-40"
    />
  );
}

/** Opens the description editor in a sheet; the same entry point for the table column and the dialog caption. */
export function openAttachmentDescriptionSheet(attachment: Attachment, triggerRef: TriggerRef) {
  useSheeter.getState().create(
    <div className="container w-full sm:pl-8">
      <AttachmentDescriptionForm attachment={attachment} />
    </div>,
    {
      id: sheetId,
      triggerRef,
      side: 'right',
      className: 'max-w-full lg:max-w-3xl',
      title: attachment.name,
      description: i18n.t('c:description'),
    },
  );
}
