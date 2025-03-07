import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { FlameKindling, ServerCrash, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import AttachmentsCarousel from '~/modules/attachments/carousel';
import { attachmentsQueryOptions } from '~/modules/attachments/query';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import Spinner from '~/modules/common/spinner';

const AttachmentDialog = ({ attachmentId, groupId, orgIdOrSlug }: { attachmentId: string; groupId?: string; orgIdOrSlug: string }) => {
  const { t } = useTranslation();
  const { isOnline } = useOnlineManager();

  const { data, isError, isLoading } = useSuspenseInfiniteQuery(attachmentsQueryOptions({ groupId, orgIdOrSlug }));

  const attachments = data?.pages.flatMap((page) => page.items);
  const slides = groupId ? attachments : attachments.filter(({ id }) => id === attachmentId);

  const startSlide = attachments?.findIndex(({ id }) => attachmentId === id);

  if (isError) return <ContentPlaceholder Icon={ServerCrash} title={t('error:request_failed')} />;

  // Show a loading spinner if no cache exists and data is still loading
  if (isLoading) {
    return (
      <div className="block">
        <Spinner className="mt-[40vh] h-10 w-10" />
      </div>
    );
  }

  return slides ? (
    <div className="flex flex-wrap relative -z-1 h-screen justify-center p-2 grow">
      <AttachmentsCarousel slides={slides} isDialog slide={startSlide} saveInSearchParams={true} />
    </div>
  ) : (
    <ContentPlaceholder Icon={isOnline ? FlameKindling : WifiOff} title={t(`${isOnline ? 'error:no_user_found' : 'common:offline.text'}`)} />
  );
};

export default AttachmentDialog;
