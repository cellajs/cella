import { useQuery } from '@tanstack/react-query';
import { FlameKindlingIcon, ServerCrashIcon, WifiOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { useUrlSheet } from '~/modules/common/sheeter/use-url-sheet';
import { Spinner } from '~/modules/common/spinner';
import { userQueryOptions } from '~/modules/user/query';
import { UserProfile } from '~/modules/user/user-profile';
import { useUserStore } from '~/modules/user/user-store';
import { tw } from '~/utils/tw';

function UserSheet({ id, organizationId }: { id: string; organizationId: string | undefined }) {
  const isOnline = useOnlineManager();
  const isSelf = useUserStore((state) => state.user?.id === id);

  const { data: user, isLoading, isError } = useQuery(userQueryOptions(id));

  if (isLoading) return <Spinner size="lg" className="mt-[45vh]" />;
  if (isError) return <ContentPlaceholder icon={ServerCrashIcon} title="error:request_failed" />;

  if (!user)
    return <ContentPlaceholder icon={isOnline ? FlameKindlingIcon : WifiOffIcon} title={isOnline ? 'error:no_user_found' : 'c:offline.text'} />;

  return <UserProfile user={user} organizationId={isSelf ? undefined : organizationId} isSheet />;
}

export function UserSheetHandler() {
  const { t } = useTranslation();

  useUrlSheet({
    searchParamKey: 'userSheetId',
    renderContent: (id, organizationId) => <UserSheet id={id} organizationId={organizationId} />,
    // The title names the sheet for assistive technology; the profile shows the user's own name as its heading.
    options: { side: 'right', title: t('c:profile'), headerClassName: 'hidden', className: tw('max-w-full p-0 lg:max-w-4xl') },
  });

  return null;
}
