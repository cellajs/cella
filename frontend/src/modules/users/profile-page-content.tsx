import { Squirrel } from 'lucide-react';
import ContentPlaceholder from '~/modules/common/content-placeholder';

const ProfilePageContent = ({ sheet, userId, orgIdOrSlug }: { userId: string; orgIdOrSlug?: string; sheet?: boolean }) => {
  // const { data: user } = useQuery({
  //   queryKey: usersKeys.single(userId),
  //   queryFn: () => getUser(userId),
  //   // Disable the query when `organizationId` is available
  //   enabled: !organizationId,
  // });

  console.info('ProfilePageContent', { userId, sheet });

  // Don't render anything until `orgId` is available
  if (!orgIdOrSlug) return <div>Do a get organizations request here</div>;

  return <ContentPlaceholder Icon={Squirrel} title={'Default user page'} />;
};

export default ProfilePageContent;
