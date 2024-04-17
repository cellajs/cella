import { useSuspenseQuery } from '@tanstack/react-query';
import { UserRoundCheck, UserRoundX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { invite as baseInvite } from '~/api/general';
import { removeMembersFromOrganization } from '~/api/memberships';
import { useMutation } from '~/hooks/use-mutations';
import { useUserStore } from '~/store/user';
import type { Organization } from '~/types';
import { Button } from '../ui/button';
import { organizationQueryOptions } from './organization';

interface Props {
  organization: Organization;
}

const JoinLeaveButton = ({ organization }: Props) => {
  const user = useUserStore((state) => state.user);
  const { t } = useTranslation();
  const organizationQuery = useSuspenseQuery(organizationQueryOptions(organization.slug));

  const { mutate: invite } = useMutation({
    mutationFn: baseInvite,
    onSuccess: () => {
      organizationQuery.refetch();
      toast.success(t('common:success.you_joined_organization'));
    },
  });

  const { mutate: leave } = useMutation({
    mutationFn: removeMembersFromOrganization,
    onSuccess: () => {
      organizationQuery.refetch();
      toast.success(t('common:success.you_left_organization'));
    },
  });

  const onJoin = () => {
    invite({
      emails: [user.email],
      role: 'MEMBER',
      resourceIdentifier: organization.slug,
    });
  };

  const onLeave = () => {
    leave({
      resourceIdentifier: organization.id,
      ids: [user.id],
    });
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
