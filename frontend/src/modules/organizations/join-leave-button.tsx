import { onlineManager } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { Check, UserRoundCheck, UserRoundX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { showToast } from '~/lib/toasts';
import { useMembersDeleteMutation } from '~/modules/common/query-client-provider/mutations/members';
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
  const navigate = useNavigate();
  const [openPopover, setOpenPopover] = useState(false);

  const { mutate: leave } = useMembersDeleteMutation();
  // TODO implement join endpoint
  // const { mutate: join } = useMembersJoinMutation();

  const onJoin = () => {
    // join({
    //   user,
    //   emails: [user.email],
    //   role: 'member',
    //   idOrSlug: organization.slug,
    //   entityType: 'organization',
    //   orgIdOrSlug: organization.id,
    // });
  };

  const onLeave = () => {
    if (!onlineManager.isOnline()) return showToast(t('common:action.offline.text'), 'warning');

    leave(
      {
        orgIdOrSlug: organization.id,
        idOrSlug: organization.slug,
        entityType: 'organization',
        ids: [user.id],
      },
      {
        onSuccess: () => {
          showToast(t('common:success.you_left_organization'), 'success');
          //TODO add check and navigate only if there no more users in org
          return navigate({ to: config.defaultRedirectPath, replace: true });
        },
      },
    );
    leave({
      orgIdOrSlug: organization.id,
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
