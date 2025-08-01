import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { PageHeader } from '~/modules/common/page/header';
import { toaster } from '~/modules/common/toaster';
import { useUpdateSelfMutation } from '~/modules/me/query';
import { userQueryOptions, useUpdateUserMutation } from '~/modules/users/query';
import type { UserSummary } from '~/modules/users/types';
import { useUserStore } from '~/store/user';

const ProfilePageContent = lazy(() => import('~/modules/users/profile-page-content'));

interface Props {
  user: UserSummary;
  isSheet?: boolean;
  orgIdOrSlug?: string;
}

/**
 * Profile page for a user
 */
const UserProfilePage = ({ user: baseUser, isSheet, orgIdOrSlug }: Props) => {
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
        entity={user}
        canUpdate={isSelf}
        disableScroll={true}
        coverUpdateCallback={coverUpdateCallback}
        panel={
          isSelf && (
            <div className="max-xs:hidden flex items-center p-2">
              <Link
                to="/settings"
                draggable="false"
                tabIndex={0}
                className="inline-flex items-center justify-center whitespace-nowrap h-9 rounded-md px-3 text-sm font-medium ring-offset-background transition-colors focus-effect bg-primary text-primary-foreground hover:bg-primary/80"
              >
                <Settings size={16} />
                <span className="max-sm:hidden ml-1">{t('common:settings')}</span>
              </Link>
            </div>
          )
        }
      />
      <Suspense>
        <FocusViewContainer className="container">
          <ProfilePageContent orgIdOrSlug={orgIdOrSlug} userId={user.id} isSheet={isSheet} />
        </FocusViewContainer>
      </Suspense>
    </>
  );
};

export default UserProfilePage;
