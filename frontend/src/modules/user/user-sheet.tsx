import { useQuery } from '@tanstack/react-query';
import { FlameKindlingIcon, ServerCrashIcon, WifiOffIcon } from 'lucide-react';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { Spinner } from '~/modules/common/spinner';
import { userQueryOptions } from '~/modules/user/query';
import { UserProfile } from '~/modules/user/user-profile';
import { useUserStore } from '~/modules/user/user-store';

interface UserSheetProps {
  id: string;
  organizationId: string | undefined;
}

export function UserSheet({ id, organizationId }: UserSheetProps) {
  const isOnline = useOnlineManager();
  const isSelf = useUserStore((state) => state.user?.id === id);

  const { data: user, isLoading, isError } = useQuery(userQueryOptions(id));

  if (isLoading) return <Spinner size="lg" className="mt-[45vh]" />;
  if (isError) return <ContentPlaceholder icon={ServerCrashIcon} title="error:request_failed" />;

  if (!user)
    return <ContentPlaceholder icon={isOnline ? FlameKindlingIcon : WifiOffIcon} title={isOnline ? 'error:no_user_found' : 'c:offline.text'} />;

  return <UserProfile user={user} organizationId={isSelf ? undefined : organizationId} isSheet />;
}
