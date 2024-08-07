import { useSuspenseQuery } from '@tanstack/react-query';
import { Check, UserRoundCheck, UserRoundX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { inviteMembers as baseInvite, removeMembers } from '~/api/memberships';
import { useMutation } from '~/hooks/use-mutations';
import { useUserStore } from '~/store/user';
import type { Organization } from '~/types';
import { Button } from '../ui/button';
import { Command, CommandGroup, CommandItem, CommandList } from '../ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { organizationQueryOptions } from './organization';

interface Props {
  organization: Organization;
}

const JoinLeaveButton = ({ organization }: Props) => {
  const user = useUserStore((state) => state.user);
  const { t } = useTranslation();
  const [openPopover, setOpenPopover] = useState(false);
  const organizationQuery = useSuspenseQuery(organizationQueryOptions(organization.slug));

  const { mutate: inviteMembers } = useMutation({
    mutationFn: baseInvite,
    onSuccess: () => {
      organizationQuery.refetch();
      toast.success(t('common:success.you_joined_organization'));
    },
  });

  const { mutate: leave } = useMutation({
    mutationFn: removeMembers,
    onSuccess: () => {
      organizationQuery.refetch();
      toast.success(t('common:success.you_left_organization'));
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
    leave({
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
