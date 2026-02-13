import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { FlameKindlingIcon, ServerCrashIcon, WifiOffIcon } from 'lucide-react';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { Spinner } from '~/modules/common/spinner';
import { userQueryOptions } from './query';
import { UserProfilePage as UserProfile } from './user-profile';

/**
 * Sheet wrapper for user profile. Handles its own data fetching.
 */
export function UserSheet({ id, orgId }: { id: string; orgId: string | undefined }) {
  const { isOnline } = useOnlineManager();
  const { tenantId } = useParams({ strict: false });

  const {
    data: user,
    isLoading,
    isError,
  } = useQuery({
    ...userQueryOptions(id, tenantId!, orgId ?? ''),
    enabled: !!tenantId,
  });

  if (isLoading) return <Spinner className="mt-[45vh] h-10 w-10" />;
  if (isError) return <ContentPlaceholder icon={ServerCrashIcon} title="error:request_failed" />;

  if (!user)
    return (
      <ContentPlaceholder
        icon={isOnline ? FlameKindlingIcon : WifiOffIcon}
        title={`${isOnline ? 'error:no_user_found' : 'common:offline.text'}`}
      />
    );

  return <UserProfile user={user} isSheet />;
}
