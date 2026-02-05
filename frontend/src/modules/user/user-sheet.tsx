import { UserBase } from '~/api.gen';
import UserProfile from './user-profile';

/**
 * Sheet wrapper for user profile.
 */
function UserSheet({ user }: { user: UserBase }) {
  return <UserProfile user={user} isSheet />;
}

export default UserSheet;
