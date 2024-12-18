import { onlineManager } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { Check, UserRoundX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { showToast } from '~/lib/toasts';
import { useMembersDeleteMutation } from '~/modules/common/query-client-provider/mutations/members';
import { Button } from '~/modules/ui/button';
import { Command, CommandGroup, CommandItem, CommandList } from '~/modules/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { useUserStore } from '~/store/user';
import type { Organization } from '~/types/common';

const LeaveButton = ({ organization }: { organization: Organization }) => {
  const { t } = useTranslation();
  const { user } = useUserStore();
  const navigate = useNavigate();
  const [openPopover, setOpenPopover] = useState(false);

  const { mutate: leave } = useMembersDeleteMutation();

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
          navigate({ to: config.defaultRedirectPath, replace: true });
        },
      },
    );
  };

  return (
    <div className="flex items-center p-2">
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
    </div>
  );
};

export default LeaveButton;
