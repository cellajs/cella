import { Link } from '@tanstack/react-router';
import { UserCog } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useEventListener } from '~/hooks/use-event-listener';
import { PageHeader } from '~/modules/common/page-header';
import { useUpdateUserMutation } from '~/modules/users/query-mutations';
import { useUserStore } from '~/store/user';

import type { LimitedUser } from '~/modules/users/types';

const ProfilePageContent = lazy(() => import('~/modules/users/profile-page-content'));

const UserProfilePage = ({ user, sheet, orgIdOrSlug }: { user: LimitedUser; sheet?: boolean; orgIdOrSlug?: string }) => {
  const { t } = useTranslation();

  const { user: currentUser, setUser } = useUserStore();

  const isSelf = currentUser.id === user.id;

  const { mutate } = useUpdateUserMutation(currentUser.id);

  useEventListener('updateEntityCover', (e) => {
    const { bannerUrl, entity } = e.detail;
    if (entity !== user.entity) return;
    mutate(
      { bannerUrl },
      {
        onSuccess: () => {
          toast.success(t('common:success.upload_cover'));
          if (isSelf) setUser({ ...currentUser, ...{ bannerUrl } });
        },
        onError: () => toast.error(t('error:image_upload_failed')),
      },
    );
  });

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
        panel={
          isSelf && (
            <div className="max-xs:hidden flex items-center p-2">
              <Link
                to="/settings"
                tabIndex={0}
                className="inline-flex items-center justify-center whitespace-nowrap h-9 rounded-md px-3 text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/80"
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
