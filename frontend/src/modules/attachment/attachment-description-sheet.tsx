import { useInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query';
import i18n from 'i18next';
import type { Attachment } from 'sdk';
import { useOrganizationLayoutContext } from '~/hooks/use-route-context';
import { attachmentQueryKeys, findAttachmentInCache, useAttachmentUpdateMutation } from '~/modules/attachment/query';
import { CollaborativeBlockNote } from '~/modules/common/blocknote/collaborative-blocknote';
import { patchDescriptionCaches } from '~/modules/common/blocknote/description-cache';
import { type TriggerRef, useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { useResolveCan } from '~/modules/entities/use-resolve-can';
import { membersListQueryOptions } from '~/modules/memberships/query';
import type { Member } from '~/modules/memberships/types';
import { organizationQueryOptions } from '~/modules/organization/query';
import { flattenInfiniteData } from '~/query/basic/flatten';

const sheetId = 'attachment-description';

/**
 * Collaborative description editor for one attachment: organization members feed the mention
 * menu, the relay persists collaborative sessions, the update mutation covers the standalone
 * fallback. Read-only for viewers without update permission.
 */
export function AttachmentDescriptionForm({ attachment }: { attachment: Attachment }) {
  const { organization: routeOrganization, tenantId } = useOrganizationLayoutContext();
  // The cached organization carries the enriched `can` grants; the route context row does not.
  const { data: organization } = useSuspenseQuery(organizationQueryOptions(routeOrganization.id, tenantId));
  const resolveCan = useResolveCan();
  const canEdit = resolveCan(organization.can?.attachment?.update, attachment.createdBy?.id ?? null);

  const membersQuery = useInfiniteQuery(
    membersListQueryOptions({
      entityId: organization.id,
      entityType: 'organization',
      tenantId,
      organizationId: organization.id,
    }),
  );
  const members = flattenInfiniteData<Member>(membersQuery.data);

  const { mutateAsync } = useAttachmentUpdateMutation(tenantId, organization.id);

  const updateData = async (description: string, collaborative: boolean) => {
    if (collaborative) {
      // The relay persists; the caches show the text until the materialized row arrives over SSE.
      patchDescriptionCaches(
        'attachment',
        attachment.id,
        {
          detailKey: attachmentQueryKeys.detail.byId(attachment.id),
          listKey: attachmentQueryKeys.list.org(organization.id),
        },
        { description, updatedAt: new Date().toISOString() },
      );
      return;
    }
    // Deleted while the sheet was open (unmount flush): nothing to persist.
    if (!findAttachmentInCache(attachment.id)) return;
    await mutateAsync({ id: attachment.id, ops: { description } });
  };

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
    <div className="container w-full">
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
