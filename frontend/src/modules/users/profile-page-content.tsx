import { SquirrelIcon } from 'lucide-react';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { OrganizationsGrid } from '~/modules/organizations/organizations-grid';

interface Props {
  userId: string;
  orgIdOrSlug?: string;
  isSheet?: boolean;
}

/**
 * This is a placeholder component for the user profile page content
 **/
function ProfilePageContent({ isSheet, userId, orgIdOrSlug }: Props) {
  if (!orgIdOrSlug)
    return <OrganizationsGrid fixedQuery={{ userId }} saveDataInSearch={!isSheet} focusView={!isSheet} />;

  return <ContentPlaceholder icon={SquirrelIcon} title="common:no_resource_yet" />;
}

export default ProfilePageContent;
