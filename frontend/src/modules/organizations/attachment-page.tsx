import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { getAttachment } from '~/api/attachments';
import { AttachmentItem } from '~/modules/common/attachments';
import { AttachmentRoute } from '~/routes/attachments';

export const attachmentQueryOptions = (orgIdOrSlug: string, id: string) =>
  queryOptions({
    queryKey: ['attachments', id],
    queryFn: () => getAttachment({ orgIdOrSlug, id }),
  });

const AttachmentPage = () => {
  const { attachmentId, orgIdOrSlug } = useParams({ from: AttachmentRoute.id });
  const { data: attachment } = useSuspenseQuery(attachmentQueryOptions(orgIdOrSlug, attachmentId));

  return (
    <div>
      <h1>{attachment.filename}</h1>
      <AttachmentItem
        containerClassName="flex w-full items-center justify-center"
        type={attachment.contentType}
        source={attachment.url}
        altName={attachment.filename}
      />
    </div>
  );
};

export default AttachmentPage;
