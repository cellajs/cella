import { onlineManager, useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { Check, UserRoundX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toaster } from '~/modules/common/toaster';
import { leaveEntity } from '~/modules/me/api';
import type { Organization } from '~/modules/organizations/types';
import { Button } from '~/modules/ui/button';
import { Command, CommandGroup, CommandItem, CommandList } from '~/modules/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';

const LeaveButton = ({ organization }: { organization: Organization }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [openPopover, setOpenPopover] = useState(false);

  const { mutate: _leaveEntity } = useMutation({ mutationFn: leaveEntity });

  const onLeave = () => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');
    const queryParams = { idOrSlug: organization.slug, entityType: 'organization' as const };

    _leaveEntity(queryParams, {
      onSuccess: () => {
        toaster(t('common:success.you_left_organization'), 'success');
        navigate({ to: config.defaultRedirectPath, replace: true });
      },
    });
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
