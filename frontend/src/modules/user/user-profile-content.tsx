import type { UserBase } from 'sdk';
import { OrganizationsGrid } from '~/modules/organization/organizations-grid';

interface Props {
  user: UserBase;
  organizationId?: string;
  isSheet?: boolean;
}

export function UserProfileContent({ isSheet, user }: Props) {
  // The page does not wrap this: content owns its container (so it can span full width) and its top padding
  return (
    <div className="container pt-4">
      <OrganizationsGrid fixedQuery={{ relatableUserId: user.id }} saveDataInSearch={!isSheet} focusView={!isSheet} />
    </div>
  );
}
