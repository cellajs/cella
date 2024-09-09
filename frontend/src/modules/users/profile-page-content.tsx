import { Palmtree } from 'lucide-react';
import ContentPlaceholder from '~/modules/common/content-placeholder';

const ProfilePageContent = ({ children }: { children?: React.ReactNode }) => {
  return <div className="container">{children ? children : <ContentPlaceholder Icon={Palmtree} title={'Default user page'} />}</div>;
};

export default ProfilePageContent;
