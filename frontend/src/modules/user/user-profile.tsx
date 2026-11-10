import { ShieldCheckIcon, ShieldMinusIcon } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { GetUserResponse } from 'sdk';
import { appConfig } from 'shared';
import { MiddleCut } from '~/modules/common/middle-cut';
import { PageHeader } from '~/modules/common/page/header';
import { toaster } from '~/modules/common/toaster/toaster';
import { ProfilePictureButton } from '~/modules/user/profile-picture-button';
import { useUpdateUser } from '~/modules/user/query';
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
        // The text column clips: pr-1 keeps it from scrolling when the link takes focus
        subline={
          <div className="text-muted-foreground flex min-w-0 items-center gap-2 pr-1">
            {user.email && (
              <a href={`mailto:${user.email}`} className="group/email focus-inset text-foreground -m-1 truncate rounded-sm p-1">
                <MiddleCut text={user.email} className="link-decoration group-active/email:link-decoration-strong group-hover/email:underline" />
              </a>
            )}
            {user.email && user.mfaRequired !== undefined && (
              <span className="flex shrink-0 items-center gap-2 max-sm:hidden">
                <span aria-hidden="true" className="text-faint-foreground">
                  ·
                </span>
                <span className="flex items-center gap-1">
                  {user.mfaRequired ? <ShieldCheckIcon className="size-3.5" /> : <ShieldMinusIcon className="size-3.5" />}
                  {t(user.mfaRequired ? 'c:mfa_on' : 'c:mfa_off')}
                </span>
              </span>
            )}
            {appConfig.mode === 'development' && <span className="ml-2 shrink-0 text-xs max-sm:hidden">{user.id}</span>}
          </div>
        }
        avatarBadge={isSelf && <ProfilePictureButton user={user} className="sm:size-8" />}
      />
      <Suspense>
        {/* No wrapper: the slot's tools bring their own container, so one can run a full-width tab nav */}
        <UserProfileContent user={user} organizationId={organizationId} isSheet={isSheet} />
      </Suspense>
    </>
  );
}
