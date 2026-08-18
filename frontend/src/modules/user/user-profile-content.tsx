import type { UserBase } from 'sdk';
import { OrganizationsGrid } from '~/modules/organization/organizations-grid';

interface Props {
  user: UserBase;
  organizationId?: string;
  isSheet?: boolean;
}

export function UserProfileContent({ isSheet, user }: Props) {
  return (
    <OrganizationsGrid fixedQuery={{ relatableUserId: user.id }} saveDataInSearch={!isSheet} focusView={!isSheet} />
  );
}
