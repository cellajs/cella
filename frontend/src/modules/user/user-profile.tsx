import { Link } from '@tanstack/react-router';
import { FlameKindlingIcon, UserRoundCogIcon } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { UserBase } from '~/api.gen';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { PageHeader } from '~/modules/common/page/header';
import { toaster } from '~/modules/common/toaster/service';
import { useUpdateSelfMutation } from '~/modules/me/query';
import { useUserUpdateMutation } from '~/modules/user/query';
import { useUserStore } from '~/store/user';

const ProfilePageContent = lazy(() => import('~/modules/user/user-profile-content'));

interface Props {
  user: UserBase;
  orgId?: string;
  isSheet?: boolean;
}

/**
 * Profile page for a user
 */
export function UserProfilePage({ user, isSheet }: Props) {
  const { t } = useTranslation();
  const { user: currentUser } = useUserStore();

  // Determine if this is current user's profile
  const isSelf = !!currentUser && currentUser.id === user.id;

  // Pick correct mutation hook
  const updateSelf = useUpdateSelfMutation();
  const updateUser = useUserUpdateMutation();

  const coverUpdateCallback = (bannerUrl: string) => {
    const callbacks = {
      onSuccess: () => toaster(t('common:success.upload_cover'), 'success'),
      onError: () => toaster(t('error:image_upload_failed'), 'error'),
    };

    if (isSelf) {
      updateSelf.mutate({ bannerUrl }, callbacks);
    } else {
      updateUser.mutate({ path: { id: user.id }, body: { bannerUrl } }, callbacks);
    }
  };

  if (!user) return <ContentPlaceholder icon={FlameKindlingIcon} title="error:no_user_found" />;

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
                to="/account"
                draggable="false"
                tabIndex={0}
                className="inline-flex items-center justify-center whitespace-nowrap h-9 rounded-md px-3 text-sm font-medium transition-colors focus-effect bg-primary text-primary-foreground hover:bg-primary/80"
              >
                <UserRoundCogIcon size={16} />
                <span className="max-sm:hidden ml-1">{t('common:my_account')}</span>
              </Link>
            </div>
          )
        }
      />
      <Suspense>
        <div className="container">
          <ProfilePageContent user={user} isSheet={isSheet} />
        </div>
      </Suspense>
    </>
  );
}
