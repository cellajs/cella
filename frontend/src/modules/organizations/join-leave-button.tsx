import { onlineManager, useSuspenseQuery } from '@tanstack/react-query';
import { Check, UserRoundCheck, UserRoundX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { inviteMembers as baseInvite, removeMembers } from '~/api/memberships';
import { useMutation } from '~/hooks/use-mutations';
import { showToast } from '~/lib/toasts';
import { organizationQueryOptions } from '~/modules/organizations/organization-page';
import { Button } from '~/modules/ui/button';
import { Command, CommandGroup, CommandItem, CommandList } from '~/modules/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { useUserStore } from '~/store/user';
import type { Organization } from '~/types/common';

interface Props {
  organization: Organization;
}

const JoinLeaveButton = ({ organization }: Props) => {
  const { t } = useTranslation();
  const { user } = useUserStore();
  const [openPopover, setOpenPopover] = useState(false);
  const organizationQuery = useSuspenseQuery(organizationQueryOptions(organization.slug));

  const { mutate: inviteMembers } = useMutation({
    mutationFn: baseInvite,
    onSuccess: () => {
      organizationQuery.refetch();
      showToast(t('common:success.you_joined_organization'), 'success');
    },
  });

  const { mutate: leave } = useMutation({
    mutationFn: removeMembers,
    onSuccess: () => {
      organizationQuery.refetch();
      showToast(t('common:success.you_left_organization'), 'success');
    },
  });

  const onJoin = () => {
    inviteMembers({
      emails: [user.email],
      role: 'member',
      idOrSlug: organization.slug,
      entityType: 'organization',
      organizationId: organization.id,
    });
  };

  const onLeave = () => {
    if (!onlineManager.isOnline()) return toast.warning(t('common:action.offline.text'));

    leave({
      organizationId: organization.id,
      idOrSlug: organization.id,
      entityType: 'organization',
      ids: [user.id],
    });
  };

  return organization.membership?.role ? (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="darkSuccess" aria-label="Leave">
          <Check size={16} />
          <span className="max-xs:hidden ml-1">{t('common:joined')}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-0 rounded-lg pointer" onCloseAutoFocus={(e) => e.preventDefault()} sideOffset={4} align="end">
        <Command className="relative rounded-lg">
          <CommandList>
            <CommandGroup>
              <CommandItem onSelect={onLeave} className="rounded-md flex justify-start gap-2 items-center leading-normal cursor-pointer">
                <UserRoundX size={16} />
                <span className="ml-1">{t('common:leave')}</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  ) : (
    <Button size="sm" onClick={onJoin} aria-label="Join">
      <UserRoundCheck size={16} />
      <span className="max-xs:hidden ml-1">{t('common:join')}</span>
    </Button>
  );
};

export default JoinLeaveButton;
