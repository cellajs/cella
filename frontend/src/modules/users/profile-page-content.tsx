import { useEffect, useState } from 'react';
import { getUser } from '~/api/users';
import ProjectsTable from '~/modules/projects/projects-table';

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

  return <ProjectsTable organizationId={orgId} userId={userId} sheet={sheet} />;
};

export default ProfilePageContent;
