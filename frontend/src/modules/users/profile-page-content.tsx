import { Squirrel } from 'lucide-react';
import ContentPlaceholder from '~/modules/common/content-placeholder';

import { useEffect, useState } from 'react';
import { getUser } from '~/api/users';

// Here you can add app-specific profile page content
const ProfilePageContent = ({ sheet, userId, organizationId }: { userId: string; organizationId?: string; sheet?: boolean }) => {
  const [orgId, setOrgId] = useState(organizationId);

  useEffect(() => {
    // If `orgId` is already provided, no need to fetch
    if (orgId) return;
    (async () => {
      const { organizations } = await getUser(userId);
      if (organizations.length > 0) setOrgId(organizations[0].id);
    })();
  }, [orgId]);

  // Don't render anything until `orgId` is available
  if (!orgId) return null;

  console.debug('data available in profile page content:', sheet, userId, organizationId);

  return <ContentPlaceholder Icon={Squirrel} title={'Default user page'} />;
};

export default ProfilePageContent;
