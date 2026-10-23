import { Link } from '@tanstack/react-router';
import { UserRoundCogIcon } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { GetUserResponse } from 'sdk';
import { PageHeader } from '~/modules/common/page/header';
import { toaster } from '~/modules/common/toaster/toaster';
import { useUpdateUser } from '~/modules/user/query';
import { UserProfileSubline } from '~/modules/user/user-profile-subline';
import { useUserStore } from '~/modules/user/user-store';
import { lazyNamed } from '~/utils/lazy-named';

const UserProfileContent = lazyNamed(() => import('~/modules/user/user-profile-content'), 'UserProfileContent');

interface UserProfileProps {
  user: GetUserResponse;
  organizationId?: string;
  isSheet?: boolean;
}

export function UserProfile({ user, organizationId, isSheet }: UserProfileProps) {
  const { t } = useTranslation();
  const currentUser = useUserStore((state) => state.user);

  const isSelf = !!currentUser && currentUser.id === user.id;

  const { mutate: updateUser } = useUpdateUser(user.id);

  const updateCover = (bannerUrl: string) => updateUser({ bannerUrl }, { onSuccess: () => toaster.success(t('c:success.upload_cover')) });

  return (
    <>
      <PageHeader
        entity={user}
        canUpdate={isSelf}
        coverUpdateCallback={updateCover}
        subline={<UserProfileSubline user={user} />}
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
        {/* No wrapper: the content owns its own container, so it can run a full-width tab nav */}
        <UserProfileContent user={user} organizationId={organizationId} isSheet={isSheet} />
      </Suspense>
    </>
  );
}
