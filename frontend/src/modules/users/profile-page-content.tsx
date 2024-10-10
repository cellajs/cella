import { useQuery } from '@tanstack/react-query';
import { getUser } from '~/api/users';
import ProjectsTable from '~/modules/projects/projects-table';

const ProfilePageContent = ({ sheet, userId, organizationId }: { userId: string; organizationId?: string; sheet?: boolean }) => {
  const { data: user } = useQuery({
    queryKey: ['users', userId],
    queryFn: () => getUser(userId),
    // Disable the query when `organizationId` is available
    enabled: !organizationId,
  });

  const orgId = organizationId || user?.organizations?.[0]?.id;

  // Don't render anything until `orgId` is available
  if (!orgId) return null;

  return <ProjectsTable organizationId={orgId} userId={userId} sheet={sheet} />;
};

export default ProfilePageContent;
