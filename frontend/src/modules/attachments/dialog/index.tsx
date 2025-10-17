import { useQuery } from '@tanstack/react-query';
import { FlameKindlingIcon, ServerCrashIcon, WifiOffIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import AttachmentsCarousel from '~/modules/attachments/carousel';
import { groupedAttachmentsQueryOptions } from '~/modules/attachments/query';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import Spinner from '~/modules/common/spinner';
import type { CustomUppyFile } from '~/modules/common/uploader/types';

interface AttachmentDialogProps {
  attachmentId: string;
  orgIdOrSlug: string;
  localAttachment?: CustomUppyFile;
}

const AttachmentDialog = ({ attachmentId, orgIdOrSlug, localAttachment }: AttachmentDialogProps) => {
  const { t } = useTranslation();
  const { isOnline } = useOnlineManager();

  const { data, error, isLoading } = useQuery({
    ...groupedAttachmentsQueryOptions({ attachmentId, orgIdOrSlug }),
    enabled: isOnline && !localAttachment,
  });

  const attachments = useMemo(() => data?.items ?? [], [data?.items]);

  const itemIndex = useMemo(() => {
    const index = attachments.findIndex(({ id }) => id === attachmentId);
    return index === -1 ? 0 : index;
  }, [attachmentId, attachments]);

  if (localAttachment?.preview) {
    return <AttachmentsCarousel items={[{ ...localAttachment, url: localAttachment.preview }]} isDialog saveInSearchParams={false} />;
  }

  if (error) return <ContentPlaceholder icon={ServerCrashIcon} title={t('error:request_failed')} />;

  // Show a loading spinner if no cache exists and data is still loading
  if (isLoading) {
    return (
      <div className="block">
        <Spinner className="mt-[45vh] h-10 w-10" />
      </div>
    );
  }

  if (!isOnline) return <ContentPlaceholder icon={WifiOffIcon} title={t('common:offline.text')} />;

  return attachments.length ? (
    <div className="flex flex-wrap relative -z-1 h-screen justify-center p-2 grow">
      <AttachmentsCarousel items={attachments} isDialog itemIndex={itemIndex} saveInSearchParams={true} />
    </div>
  ) : (
    <ContentPlaceholder icon={FlameKindlingIcon} title={t('error:not_found.text')} />
  );
};

export default AttachmentDialog;
