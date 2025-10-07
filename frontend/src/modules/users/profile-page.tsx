import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { FlameKindling, ServerCrash, Settings } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { PageHeader } from '~/modules/common/page/header';
import Spinner from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/service';
import { useUpdateSelfMutation } from '~/modules/me/query';
import { userQueryOptions, useUpdateUserMutation } from '~/modules/users/query';
import { useUserStore } from '~/store/user';

const ProfilePageContent = lazy(() => import('~/modules/users/profile-page-content'));

interface Props {
  idOrSlug: string;
  isSheet?: boolean;
  orgIdOrSlug?: string;
}

/**
 * Profile page for a user
 */
const UserProfilePage = ({ idOrSlug, isSheet, orgIdOrSlug }: Props) => {
  const { t } = useTranslation();
  const { user: currentUser } = useUserStore();

  // Determine if this is current user's profile
  const isSelf = !!currentUser && (currentUser.id === idOrSlug || currentUser.slug === idOrSlug);

  // Fetch user data (skip if self, use store data instead)
  const {
    data: user,
    isLoading,
    isError,
  } = useQuery({
    ...userQueryOptions(idOrSlug),
    enabled: !isSelf,
    initialData: isSelf ? currentUser : undefined,
  });

  // Pick correct mutation hook
  const useMutationHook = isSelf ? useUpdateSelfMutation : useUpdateUserMutation;
  const { mutate } = useMutationHook();

  const coverUpdateCallback = (bannerUrl: string) => {
    mutate(
      { idOrSlug: currentUser.id, bannerUrl },
      {
        onSuccess: () => toaster(t('common:success.upload_cover'), 'success'),
        onError: () => toaster(t('error:image_upload_failed'), 'error'),
      },
    );
  };

  if (isLoading)
    return (
      <div className="block">
        <Spinner className="mt-[45vh] h-10 w-10" />
      </div>
    );

  if (isError) return <ContentPlaceholder icon={ServerCrash} title={t('error:request_failed')} />;
  if (!user) return <ContentPlaceholder icon={FlameKindling} title={t('error:no_user_found')} />;

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
                <Settings size={16} />
                <span className="max-sm:hidden ml-1">{t('common:my_account')}</span>
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
