import { Squirrel } from 'lucide-react';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import EntityGridWrapper from '../entities/entity-grid-wrapper';

/**
 * This is a placeholder component for the user profile page content
 **/
const ProfilePageContent = ({ sheet, userId, orgIdOrSlug }: { userId: string; orgIdOrSlug?: string; sheet?: boolean }) => {
  // Log props to prevent code style issues
  console.info('ProfilePageContent', { userId, sheet, orgIdOrSlug });

  // Don't render anything until `orgId` is available
  if (!orgIdOrSlug) return <EntityGridWrapper />;

  return <ContentPlaceholder Icon={Squirrel} title={'Default user page'} />;
};

export default ProfilePageContent;
