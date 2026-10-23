import { Link } from '@tanstack/react-router';
import { UserRoundCogIcon } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { GetUserResponse } from 'sdk';
import { PageHeader } from '~/modules/common/page/header';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button } from '~/modules/ui/button';
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
              <Button size="sm" render={<Link to="/account" draggable={false} />}>
                <UserRoundCogIcon />
                <span className="max-sm:sr-only">{t('c:settings')}</span>
              </Button>
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
