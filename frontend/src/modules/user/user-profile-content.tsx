import { useParams } from '@tanstack/react-router';
import { t } from 'i18next';
import { SquirrelIcon } from 'lucide-react';
import { UserBase } from '~/api.gen';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { OrganizationsGrid } from '~/modules/organization/organizations-grid';

interface Props {
  user: UserBase;
  isSheet?: boolean;
}

/**
 * This is a placeholder component for the user profile content
 **/
function UserProfileContent({ isSheet, user }: Props) {
  const { orgSlug } = useParams({ strict: false });
  const hasOrgContext = !!orgSlug;

  if (!hasOrgContext)
    return <OrganizationsGrid fixedQuery={{ userId: user.id }} saveDataInSearch={!isSheet} focusView={!isSheet} />;

  return (
    <ContentPlaceholder
      icon={SquirrelIcon}
      title="common:no_resource_yet"
      titleProps={{ resource: t('common:organizations').toLowerCase() }}
    />
  );
}

export default UserProfileContent;
