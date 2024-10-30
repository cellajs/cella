import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { getAttachment } from '~/api/attachments';
import { OrganizationAttachmentRoute } from '~/routes/organizations';
import type { Organization } from '~/types/common';

interface AttachmentPageProps {
  organization: Organization;
}

export const attachmentQueryOptions = (orgIdOrSlug: string, id: string) =>
  queryOptions({
    queryKey: ['attachments', id],
    queryFn: () =>
      getAttachment({
        orgIdOrSlug,
        id,
      }),
  });

const AttachmentPage = ({ organization }: AttachmentPageProps) => {
  const { attachmentId } = useParams({ from: OrganizationAttachmentRoute.id });
  const { data: attachment } = useSuspenseQuery(attachmentQueryOptions(organization.id, attachmentId));

  return (
    <div>
      <h1>{attachment.filename}</h1>
      <img src={attachment.url} alt={attachment.filename} />
    </div>
  );
};

export default AttachmentPage;
