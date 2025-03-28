import { useSuspenseQuery } from '@tanstack/react-query';
import { FlameKindling, ServerCrash, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import AttachmentsCarousel from '~/modules/attachments/attachments-carousel';
import { groupedAttachmentsQueryOptions } from '~/modules/attachments/query/options';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import Spinner from '~/modules/common/spinner';

interface AttachmentDialogProps {
  attachmentId: string;
  orgIdOrSlug: string;
  groupId?: string;
}

const AttachmentDialog = ({ attachmentId, groupId, orgIdOrSlug }: AttachmentDialogProps) => {
  const { t } = useTranslation();
  const { isOnline } = useOnlineManager();

  const { data, isError, isLoading } = useSuspenseQuery(groupedAttachmentsQueryOptions({ groupId, orgIdOrSlug }));

  const attachments = data?.items ?? [];
  // TODO(IMPROVE) improve fetch when no groupId(mb fetch by attachment id and return group if there is one)
  const items = groupId ? attachments : attachments.filter(({ id }) => id === attachmentId);

  const itemIndex = attachments?.findIndex(({ id }) => attachmentId === id);

  if (isError) return <ContentPlaceholder Icon={ServerCrash} title={t('error:request_failed')} />;

  // Show a loading spinner if no cache exists and data is still loading
  if (isLoading) {
    return (
      <div className="block">
        <Spinner className="mt-[45vh] h-10 w-10" />
      </div>
    );
  }

  return items ? (
    <div className="flex flex-wrap relative -z-1 h-screen justify-center p-2 grow">
      <AttachmentsCarousel items={items} isDialog itemIndex={itemIndex} saveInSearchParams={true} />
    </div>
  ) : (
    <ContentPlaceholder Icon={isOnline ? FlameKindling : WifiOff} title={t(`${isOnline ? 'error:no_user_found' : 'common:offline.text'}`)} />
  );
};

export default AttachmentDialog;
