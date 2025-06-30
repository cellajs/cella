import { onlineManager, useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { Check, UserRoundX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteMyMembership } from '~/api.gen';
import { toaster } from '~/modules/common/toaster';
import type { EntitySummary } from '~/modules/entities/types';
import { deleteMenuItem } from '~/modules/navigation/menu-sheet/helpers/menu-operations';
import { Button } from '~/modules/ui/button';
import { Command, CommandGroup, CommandItem, CommandList } from '~/modules/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';

const LeaveButton = ({ entity }: { entity: EntitySummary }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [openPopover, setOpenPopover] = useState(false);

  // TODO the code is not isomorphic, shouldn't it also clear cache for this organization?
  const { mutate: _deleteMyMembership } = useMutation({
    mutationFn: async () => {
      const idOrSlug = entity.id;
      return await deleteMyMembership({ query: { idOrSlug, entityType: entity.entityType } });
    },
    onSuccess: () => {
      toaster(t('common:success.you_left_entity', { entity: entity.entityType }), 'success');
      navigate({ to: config.defaultRedirectPath, replace: true });
      deleteMenuItem(entity.id);
    },
  });

  const onLeave = () => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');
    _deleteMyMembership();
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
