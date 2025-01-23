import { Squirrel } from 'lucide-react';
import ContentPlaceholder from '~/modules/common/content-placeholder';

const ProfilePageContent = ({ sheet, userId, orgIdOrSlug }: { userId: string; orgIdOrSlug?: string; sheet?: boolean }) => {
  // const queryOptions = userQueryOptions(userId);
  // const { data: user } = useQuery({
  //   ...queryOptions,
  //  // Enable the query only when `orgIdOrSlug` is defined
  //  enabled: !!orgIdOrSlug,
  // });

  console.info('ProfilePageContent', { userId, sheet });

  // Don't render anything until `orgId` is available
  if (!orgIdOrSlug) return <div>Do a get organizations request here</div>;

  return <ContentPlaceholder Icon={Squirrel} title={'Default user page'} />;
};

export default ProfilePageContent;
