import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { GetUserResponse } from 'sdk';
import { PageHeader } from '~/modules/common/page/header';
import { toaster } from '~/modules/common/toaster/toaster';
import { ProfilePictureButton } from '~/modules/user/profile-picture-button';
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
  const isSelf = useUserStore((state) => state.user?.id === user.id);

  const { mutate: updateUser } = useUpdateUser(user.id);

  const updateCover = (bannerUrl: string) => updateUser({ bannerUrl }, { onSuccess: () => toaster.success(t('c:success.upload_cover')) });
  const deleteCover = () =>
    updateUser({ bannerUrl: null }, { onSuccess: () => toaster.success(t('c:success.delete_resource', { resource: t('c:cover') })) });

  return (
    <>
      <PageHeader
        entity={user}
        canUpdate={isSelf}
        onCoverUpdate={updateCover}
        onCoverDelete={deleteCover}
        subline={<UserProfileSubline user={user} />}
        avatarBadge={isSelf && <ProfilePictureButton user={user} className="sm:size-8" />}
      />
      <Suspense>
        {/* No wrapper: the slot's tools bring their own container, so one can run a full-width tab nav */}
        <UserProfileContent user={user} organizationId={organizationId} isSheet={isSheet} />
      </Suspense>
    </>
  );
}
