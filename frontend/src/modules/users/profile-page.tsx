import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { UserCog } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '~/modules/common/page/page-header';
import { toaster } from '~/modules/common/toaster';
import { useUpdateSelfMutation } from '~/modules/me/query';
import { useUpdateUserMutation, userQueryOptions } from '~/modules/users/query';
import type { LimitedUser } from '~/modules/users/types';
import { useUserStore } from '~/store/user';

const ProfilePageContent = lazy(() => import('~/modules/users/profile-page-content'));

const UserProfilePage = ({ user: baseUser, sheet, orgIdOrSlug }: { user: LimitedUser; sheet?: boolean; orgIdOrSlug?: string }) => {
  const { t } = useTranslation();

  // Use loader data but also fetch from cache to ensure it's up to date
  const { data } = useQuery(userQueryOptions(baseUser.id));
  const user = data || baseUser;

  // Check if user is current user
  const { user: currentUser } = useUserStore();
  const isSelf = currentUser.id === user.id;

  const mutationFn = isSelf ? useUpdateSelfMutation : useUpdateUserMutation;
  const { mutate } = mutationFn();

  const coverUpdateCallback = (bannerUrl: string) => {
    mutate(
      { idOrSlug: currentUser.id, bannerUrl },
      {
        onSuccess: () => toaster(t('common:success.upload_cover'), 'success'),
        onError: () => toaster(t('error:image_upload_failed'), 'error'),
      },
    );
  };

  return (
    <>
      <PageHeader
        id={user.id}
        title={user.name}
        type="user"
        disableScroll={true}
        isAdmin={isSelf}
        thumbnailUrl={user.thumbnailUrl}
        bannerUrl={user.bannerUrl}
        coverUpdateCallback={coverUpdateCallback}
        panel={
          isSelf && (
            <div className="max-xs:hidden flex items-center p-2">
              <Link
                to="/settings"
                draggable="false"
                tabIndex={0}
                className="inline-flex items-center justify-center whitespace-nowrap h-9 rounded-md px-3 text-sm font-medium ring-offset-background transition-colors focus-visible:outline-hidden sm:focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/80"
              >
                <UserCog size={16} />
                <span className="max-sm:hidden ml-1">{t('common:settings')}</span>
              </Link>
            </div>
          )
        }
      />
      <Suspense>
        <div className="container">
          <ProfilePageContent orgIdOrSlug={orgIdOrSlug} userId={user.id} sheet={sheet} />
        </div>
      </Suspense>
    </>
  );
};

export default UserProfilePage;
