import { t } from 'i18next';
import { SquirrelIcon } from 'lucide-react';
import { UserBase } from 'sdk';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { OrganizationsGrid } from '~/modules/organization/organizations-grid';

interface Props {
  user: UserBase;
  organizationId?: string;
  isSheet?: boolean;
}

/**
 * This is a placeholder component for the user profile content
 **/
function UserProfileContent({ isSheet, user, organizationId }: Props) {
  const hasOrgContext = !!organizationId;

  if (!hasOrgContext)
    return (
      <OrganizationsGrid fixedQuery={{ relatableUserId: user.id }} saveDataInSearch={!isSheet} focusView={!isSheet} />
    );

  return (
    <ContentPlaceholder
      icon={SquirrelIcon}
      title="common:no_resource_yet"
      titleProps={{ resource: t('common:organizations').toLowerCase() }}
    />
  );
}

export default UserProfileContent;
