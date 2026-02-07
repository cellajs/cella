import { UserBase } from '~/api.gen';
import { UserProfilePage as UserProfile } from './user-profile';

/**
 * Sheet wrapper for user profile.
 */
export function UserSheet({ user }: { user: UserBase }) {
  return <UserProfile user={user} isSheet />;
}
