import { onlineManager } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { showToast } from '~/lib/toasts';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';
import { useAttachmentDeleteMutation } from '~/modules/common/query-client-provider/attachments';
import type { Attachment } from '~/types/common';

interface Props {
  organizationId: string;
  attachments: Attachment[];
  callback?: (attachments: Attachment[]) => void;
  dialog?: boolean;
}

const RemoveAttachmentsForm = ({ attachments, organizationId, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();

  const { mutate: deleteAttachments, isPending } = useAttachmentDeleteMutation();

  const onRemove = () => {
    if (!onlineManager.isOnline()) return showToast(t('common:action.offline.text'), 'warning');

    deleteAttachments({
      orgIdOrSlug: organizationId,
      ids: attachments.map((a) => a.id),
    });
    if (isDialog) dialog.remove();
    callback?.(attachments);
  };

  return <DeleteForm onDelete={onRemove} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default RemoveAttachmentsForm;
