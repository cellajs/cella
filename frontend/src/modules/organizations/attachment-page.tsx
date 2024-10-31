import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { getAttachment } from '~/api/attachments';
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
      <img src={attachment.url} alt={attachment.filename} />
    </div>
  );
};

export default AttachmentPage;
