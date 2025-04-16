import { Squirrel } from 'lucide-react';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import EntityGridWrapper from '~/modules/entities/entity-grid-wrapper';

interface Props {
  userId: string;
  orgIdOrSlug?: string;
  isSheet?: boolean;
}

/**
 * This is a placeholder component for the user profile page content
 **/
const ProfilePageContent = ({ isSheet, userId, orgIdOrSlug }: Props) => {
  if (!orgIdOrSlug) return <EntityGridWrapper userId={userId} entityType="organization" isSheet={isSheet} />;

  return <ContentPlaceholder icon={Squirrel} title={'Default user page'} />;
};

export default ProfilePageContent;
