import { useSuspenseQuery } from '@tanstack/react-query';
import { ChevronDown, UserRoundCheck, Check, UserRoundX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { invite as baseInvite } from '~/api/general';
import { removeMembersFromResource } from '~/api/memberships';
import { useMutation } from '~/hooks/use-mutations';
import { useUserStore } from '~/store/user';
import type { Organization } from '~/types';
import { Button } from '../ui/button';
import { organizationQueryOptions } from './organization';
import { useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { Command, CommandGroup, CommandList, CommandItem } from '../ui/command';

interface Props {
  organization: Organization;
}

const JoinLeaveButton = ({ organization }: Props) => {
  const user = useUserStore((state) => state.user);
  const { t } = useTranslation();
  const [openPopover, setOpenPopover] = useState(false);
  const organizationQuery = useSuspenseQuery(organizationQueryOptions(organization.slug));

  const { mutate: invite } = useMutation({
    mutationFn: baseInvite,
    onSuccess: () => {
      organizationQuery.refetch();
      toast.success(t('common:success.you_joined_organization'));
    },
  });

  const { mutate: leave } = useMutation({
    mutationFn: removeMembersFromResource,
    onSuccess: () => {
      organizationQuery.refetch();
      toast.success(t('common:success.you_left_organization'));
    },
  });

  const onJoin = () => {
    invite({
      emails: [user.email],
      role: 'MEMBER',
      idOrSlug: organization.slug,
    });
  };

  const onLeave = () => {
    leave({
      idOrSlug: organization.id,
      ids: [user.id],
    });
  };

  return organization.userRole ? (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="darkSuccess" aria-label="Leave" className="items-center gap-1">
          <Check size={16} />
          <span className="ml-1">{t('common:joined')}</span>
          <ChevronDown size={14} />
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
      <span className="ml-1">{t('common:join')}</span>
    </Button>
  );
};

export default JoinLeaveButton;
