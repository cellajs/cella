import type { UserBase } from 'sdk';
import { OrganizationsGrid } from '~/modules/organization/organizations-grid';

interface Props {
  user: UserBase;
  organizationId?: string;
  isSheet?: boolean;
}

/**
 * This is a placeholder component for the user profile content
 **/
export function UserProfileContent({ isSheet, user }: Props) {
  return (
    <OrganizationsGrid fixedQuery={{ relatableUserId: user.id }} saveDataInSearch={!isSheet} focusView={!isSheet} />
  );
}
