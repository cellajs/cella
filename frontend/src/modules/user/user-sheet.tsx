import { findUserInListCache } from './query';
import { UserProfilePage as UserProfile } from './user-profile';

/**
 * Sheet wrapper for user profile.
 */
export function UserSheet({ id, orgId }: { id: string; orgId?: string }) {
  const user = findUserInListCache(id);

  if (!user) return null;

  return <UserProfile user={user} orgId={orgId} isSheet />;
}
