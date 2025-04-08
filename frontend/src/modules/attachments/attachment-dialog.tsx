import { useQuery } from '@tanstack/react-query';
import { FlameKindling, ServerCrash, WifiOff } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import AttachmentsCarousel from '~/modules/attachments/attachments-carousel';
import { groupedAttachmentsQueryOptions } from '~/modules/attachments/query/options';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import Spinner from '~/modules/common/spinner';

interface AttachmentDialogProps {
  attachmentId: string;
  orgIdOrSlug: string;
}

const AttachmentDialog = ({ attachmentId, orgIdOrSlug }: AttachmentDialogProps) => {
  const { t } = useTranslation();
  const { isOnline } = useOnlineManager();

  const { data, isError, isLoading } = useQuery(groupedAttachmentsQueryOptions({ attachmentId, orgIdOrSlug }));

  const attachments = data?.items ?? [];

  const itemIndex = useMemo(() => {
    const index = attachments.findIndex(({ id }) => id === attachmentId);
    return index === -1 ? 0 : index;
  }, [attachmentId, attachments]);

  if (isError) return <ContentPlaceholder icon={ServerCrash} title={t('error:request_failed')} />;

  // Show a loading spinner if no cache exists and data is still loading
  if (isLoading) {
    return (
      <div className="block">
        <Spinner className="mt-[45vh] h-10 w-10" />
      </div>
    );
  }

  return attachments ? (
    <div className="flex flex-wrap relative -z-1 h-screen justify-center p-2 grow">
      <AttachmentsCarousel items={attachments} isDialog itemIndex={itemIndex} saveInSearchParams={true} />
    </div>
  ) : (
    <ContentPlaceholder icon={isOnline ? FlameKindling : WifiOff} title={t(`${isOnline ? 'error:no_user_found' : 'common:offline.text'}`)} />
  );
};

export default AttachmentDialog;
