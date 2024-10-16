// import { useQuery } from '@tanstack/react-query';
// import { getUser } from '~/api/users';

import { Squirrel } from 'lucide-react';
import ContentPlaceholder from '../common/content-placeholder';

const ProfilePageContent = ({ sheet, userId, organizationId }: { userId: string; organizationId?: string; sheet?: boolean }) => {
  // const { data: user } = useQuery({
  //   queryKey: ['users', userId],
  //   queryFn: () => getUser(userId),
  //   // Disable the query when `organizationId` is available
  //   enabled: !organizationId,
  // });

  console.info('ProfilePageContent', { userId, sheet });

  // Don't render anything until `orgId` is available
  if (!organizationId) return <div>Do a get organizations request here</div>;

  return <ContentPlaceholder Icon={Squirrel} title={'Default user page'} />;
};

export default ProfilePageContent;
