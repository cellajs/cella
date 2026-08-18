import type { UserBase } from 'sdk';
import { OrganizationsGrid } from '~/modules/organization/organizations-grid';

interface Props {
  user: UserBase;
  organizationId?: string;
  isSheet?: boolean;
}

export function UserProfileContent({ isSheet, user }: Props) {
  // The page does not wrap this: content owns its container, so a replacement can span full width
  return (
    <div className="container">
      <OrganizationsGrid fixedQuery={{ relatableUserId: user.id }} saveDataInSearch={!isSheet} focusView={!isSheet} />
    </div>
  );
}
