import { useSuspenseQuery } from '@tanstack/react-query';
import { UserRoundCheck, UserRoundX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { invite } from '~/api/general';
import { removeMembersFromOrganization } from '~/api/organizations';
import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { useUserStore } from '~/store/user';
import type { Organization } from '~/types';
import { organizationQueryOptions } from '../organizations/organization';
import { Button } from '../ui/button';

interface Props {
  organization: Organization;
}

const JoinLeaveButton = ({ organization }: Props) => {
  const user = useUserStore((state) => state.user);
  const { t } = useTranslation();
  const [apiWrapper] = useApiWrapper();
  const organizationQuery = useSuspenseQuery(organizationQueryOptions(organization.slug));

  const onJoin = () => {
    apiWrapper(
      () => invite([user.email], 'MEMBER', organization.slug),
      () => {
        organizationQuery.refetch();
        toast.success(t('common:success.you_joined_organization'));
      },
    );
  };

  const onLeave = () => {
    apiWrapper(
      () => removeMembersFromOrganization(organization.slug, [user.id]),
      () => {
        organizationQuery.refetch();
        toast.success(t('common:success.you_left_organization'));
      },
    );
  };

  return organization.userRole ? (
    <Button size="sm" onClick={onLeave} aria-label="Leave">
      <UserRoundX size={16} />
      <span className="ml-1">{t('common:leave')}</span>
    </Button>
  ) : (
    <Button size="sm" onClick={onJoin} aria-label="Join">
      <UserRoundCheck size={16} />
      <span className="ml-1">{t('common:join')}</span>
    </Button>
  );
};

export default JoinLeaveButton;
