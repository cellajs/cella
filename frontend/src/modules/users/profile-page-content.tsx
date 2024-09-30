import { Squirrel } from 'lucide-react';
import ContentPlaceholder from '~/modules/common/content-placeholder';

// Here you can add app-specific profile page content
const ProfilePageContent = ({ sheet, userId }: { userId: string; sheet?: boolean }) => {
  console.debug('data available in profile page content:', sheet, userId);

  return (
    <div className="container">
      <ContentPlaceholder Icon={Squirrel} title={'Default user page'} />
    </div>
  );
};

export default ProfilePageContent;
