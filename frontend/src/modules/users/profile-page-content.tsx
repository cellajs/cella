import ProjectsTable from '~/modules/projects/projects-table';

const ProfilePageContent = ({ sheet, userId, organizationId }: { userId: string; organizationId: string; sheet?: boolean }) => {
  return (
    <div className="container">
      <ProjectsTable organizationId={organizationId} userId={userId} sheet={sheet} />
    </div>
  );
};

export default ProfilePageContent;
