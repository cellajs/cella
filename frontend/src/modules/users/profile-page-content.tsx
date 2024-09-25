import ProjectsTable from '~/modules/projects/projects-table';

const ProfilePageContent = ({ sheet, userId }: { userId: string; sheet?: boolean }) => {
  return (
    <div className="container">
      <ProjectsTable userId={userId} sheet={sheet} />
    </div>
  );
};

export default ProfilePageContent;
