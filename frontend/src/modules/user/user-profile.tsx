import { Link } from '@tanstack/react-router';
import { FlameKindlingIcon, UserRoundCogIcon } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserBase } from 'sdk';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { PageHeader } from '~/modules/common/page/header';
import { toaster } from '~/modules/common/toaster/toaster';
import { useUpdateSelfMutation } from '~/modules/me/query';
import { useUserUpdateMutation } from '~/modules/user/query';
import { useUserStore } from '~/modules/user/user-store';
import { lazyNamed } from '~/utils/lazy-named';

const ProfilePageContent = lazyNamed(() => import('~/modules/user/user-profile-content'), 'UserProfileContent');

interface Props {
  user: UserBase;
  organizationId?: string;
  isSheet?: boolean;
}

/**
 * Profile page for a user
 */
export function UserProfilePage({ user, organizationId, isSheet }: Props) {
  const { t } = useTranslation();
  const { user: currentUser } = useUserStore();

  // Determine if this is current user's profile
  const isSelf = !!currentUser && currentUser.id === user.id;

  // Pick correct mutation hook
  const updateSelf = useUpdateSelfMutation();
  const updateUser = useUserUpdateMutation();

  const coverUpdateCallback = (bannerUrl: string) => {
    const callbacks = {
      onSuccess: () => toaster.success(t('c:success.upload_cover')),
      onError: () => toaster.error(t('error:image_upload_failed')),
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
        coverUpdateCallback={coverUpdateCallback}
        panel={
          isSelf && (
            <div className="flex items-center p-2 max-xs:hidden">
              <Link
                to="/account"
                draggable={false}
                tabIndex={0}
                className="focus-effect inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md bg-primary px-3 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/80"
              >
                <UserRoundCogIcon />
                <span className="ml-1 max-sm:hidden">{t('c:settings')}</span>
              </Link>
            </div>
          )
        }
      />
      <Suspense>
        <div className="container">
          <ProfilePageContent user={user} organizationId={organizationId} isSheet={isSheet} />
        </div>
      </Suspense>
    </>
  );
}
