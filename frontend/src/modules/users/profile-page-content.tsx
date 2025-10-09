import { SquirrelIcon } from 'lucide-react';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import EntityGrid from '~/modules/entities/entity-grid';

interface Props {
  userId: string;
  orgIdOrSlug?: string;
  isSheet?: boolean;
}

/**
 * This is a placeholder component for the user profile page content
 **/
const ProfilePageContent = ({ isSheet, userId, orgIdOrSlug }: Props) => {
  if (!orgIdOrSlug)
    return <EntityGrid entityType="organization" label="common:organization" userId={userId} saveDataInSearch={!isSheet} focusView={!isSheet} />;

  return <ContentPlaceholder icon={SquirrelIcon} title={'Default user page'} />;
};

export default ProfilePageContent;
