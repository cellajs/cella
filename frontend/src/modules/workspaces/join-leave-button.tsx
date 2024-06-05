import { useSuspenseQuery } from '@tanstack/react-query';
import { Check, UserRoundCheck, UserRoundX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { removeMembersFromResource, inviteMember as baseInvite } from '~/api/memberships';
import { useMutation } from '~/hooks/use-mutations';
import { useUserStore } from '~/store/user';
import type { Workspace } from '~/types';
import { workspaceQueryOptions } from '.';
import { Button } from '../ui/button';
import { Command, CommandGroup, CommandItem, CommandList } from '../ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

interface Props {
  workspace: Workspace;
}

const WorkspaceJoinLeaveButton = ({ workspace }: Props) => {
  const user = useUserStore((state) => state.user);
  const { t } = useTranslation();
  const [openPopover, setOpenPopover] = useState(false);
  const workspaceQuery = useSuspenseQuery(workspaceQueryOptions(workspace.slug));

  // ADD invite to workspace
  const { mutate: inviteMember } = useMutation({
    mutationFn: baseInvite,
    onSuccess: () => {
      workspaceQuery.refetch();
      toast.success(t('common:success.you_joined_workspace'));
    },
  });

  const { mutate: leave } = useMutation({
    mutationFn: removeMembersFromResource,
    onSuccess: () => {
      workspaceQuery.refetch();
      toast.success(t('common:success.you_left_workspace'));
    },
  });

  const onJoin = () => {
    inviteMember({
      emails: [user.email],
      role: 'MEMBER',
      idOrSlug: workspace.slug,
    });
  };

  const onLeave = () => {
    leave({
      idOrSlug: workspace.id,
      entityType: 'WORKSPACE',
      ids: [user.id],
    });
  };

  return workspace.role ? (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="darkSuccess" aria-label="Leave" className="items-center gap-1">
          <Check size={16} />
          <span>{t('common:joined')}</span>
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

export default WorkspaceJoinLeaveButton;
