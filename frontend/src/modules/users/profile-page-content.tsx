// import { useQuery } from '@tanstack/react-query';
// import { getUser } from '~/api/users';
import ProjectsTable from '~/modules/projects/projects-table';

const ProfilePageContent = ({ sheet, userId, organizationId }: { userId: string; organizationId?: string; sheet?: boolean }) => {
  // const { data: user } = useQuery({
  //   queryKey: ['users', userId],
  //   queryFn: () => getUser(userId),
  //   // Disable the query when `organizationId` is available
  //   enabled: !organizationId,
  // });

  // Don't render anything until `orgId` is available
  if (!organizationId) return <div>Do a get organizations request here</div>;

  return <ProjectsTable organizationId={organizationId} userId={userId} sheet={sheet} />;
};

export default ProfilePageContent;
