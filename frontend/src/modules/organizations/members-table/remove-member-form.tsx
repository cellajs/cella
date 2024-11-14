import { onlineManager } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { queryClient } from '~/lib/router';
import { showToast } from '~/lib/toasts';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';
import { useMembersDeleteMutation } from '~/modules/common/query-client-provider/members';
import { membersKeys } from '~/modules/common/query-client-provider/members/keys';
import type { ContextEntity, Member } from '~/types/common';

interface Props {
  entityIdOrSlug: string;
  organizationId: string;
  members: Member[];
  entityType?: ContextEntity;
  callback?: (members: Member[]) => void;
  dialog?: boolean;
}

const RemoveMembersForm = ({ members, entityIdOrSlug, entityType = 'organization', organizationId, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();

  const { mutate: removeMembers, isPending } = useMembersDeleteMutation();

  const onRemoveMember = () => {
    if (!onlineManager.isOnline()) return showToast(t('common:action.offline.text'), 'warning');

    removeMembers(
      {
        orgIdOrSlug: organizationId,
        idOrSlug: entityIdOrSlug,
        entityType,
        ids: members.map((member) => member.id),
      },
      {
        onSuccess: (data, variables, context) => {
          queryClient.getMutationDefaults(membersKeys.delete()).onSuccess?.(data, variables, context);

          callback?.(members);
          if (isDialog) dialog.remove();
        },
      },
    );
  };

  return <DeleteForm onDelete={onRemoveMember} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default RemoveMembersForm;
