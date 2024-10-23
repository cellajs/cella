import { useNavigate } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';

import type { LimitedUser, Member } from '~/types/common';

import { UserCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';
import { useEventListener } from '~/hooks/use-event-listener';
import { PageHeader } from '~/modules/common/page-header';
import { Button } from '~/modules/ui/button';
import { useUpdateUserMutation } from '~/modules/users/update-user-form';
import { useUserStore } from '~/store/user';
import type { entitySuggestionSchema } from '#/modules/general/schema';

type OrganizationSuggestions = z.infer<typeof entitySuggestionSchema>;

const isUserMember = (user: LimitedUser | Member): user is Member => {
  return 'membership' in user && user.membership !== undefined;
};
const ProfilePageContent = lazy(() => import('~/modules/users/profile-page-content'));

const UserProfilePage = ({ user, sheet }: { user: (LimitedUser & { organizations?: OrganizationSuggestions[] }) | Member; sheet?: boolean }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { user: currentUser, setUser } = useUserStore();

  const isSelf = currentUser.id === user.id;
  const organizationId = isUserMember(user) ? user.membership.organizationId : undefined;

  const { mutate } = useUpdateUserMutation(currentUser.id);

  // TODO this should be a Link with button variant style?
  const handleSettingCLick = () => {
    navigate({ to: '/user/settings', replace: true });
  };

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
        onError: () => toast.error(t('common:error.image_upload_failed')),
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
              <Button size="sm" onClick={handleSettingCLick} aria-label="Account">
                <UserCog size={16} />
                <span className="max-sm:hidden ml-1">{t('common:settings')}</span>
              </Button>
            </div>
          )
        }
      />
      <Suspense>
        <div className="container">
          <ProfilePageContent organizationId={organizationId} userId={user.id} sheet={sheet} />
        </div>
      </Suspense>
    </>
  );
};

export default UserProfilePage;
