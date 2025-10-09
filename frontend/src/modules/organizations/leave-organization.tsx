import { CheckIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LeaveEntityButton, type LeaveEntityButtonProps } from '~/modules/memberships/leave-entity-button';
import { Button } from '~/modules/ui/button';
import { Command, CommandGroup, CommandItem, CommandList } from '~/modules/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';

const LeaveOrgButton = (props: LeaveEntityButtonProps) => {
  const { t } = useTranslation();
  const [openPopover, setOpenPopover] = useState(false);

  return (
    <div className="flex items-center p-2">
      <Popover open={openPopover} onOpenChange={setOpenPopover}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="darkSuccess" aria-label="Leave">
            <CheckIcon size={16} />
            <span className="max-xs:hidden ml-1">{t('common:joined')}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-0 rounded-lg pointer" onCloseAutoFocus={(e) => e.preventDefault()} sideOffset={4} align="end">
          <Command className="relative rounded-lg">
            <CommandList>
              <CommandGroup>
                <CommandItem className="sm:p-0">
                  <LeaveEntityButton {...props} />
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default LeaveOrgButton;
