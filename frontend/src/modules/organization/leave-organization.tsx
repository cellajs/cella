import { CheckIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LeaveChannelEntityButton,
  type LeaveChannelEntityButtonProps,
} from '~/modules/memberships/leave-channel-entity-button';
import { Button } from '~/modules/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';

function LeaveOrgButton(props: LeaveChannelEntityButtonProps) {
  const { t } = useTranslation();
  const [openPopover, setOpenPopover] = useState(false);

  return (
    <div className="flex items-center p-2">
      <Popover open={openPopover} onOpenChange={setOpenPopover}>
        <PopoverTrigger render={<Button size="sm" variant="success" aria-label="Leave" />}>
          <CheckIcon />
          <span className="ml-1 max-xs:hidden">{t('c:joined')}</span>
        </PopoverTrigger>
        <PopoverContent className="pointer w-44 rounded-lg p-1" finalFocus={false} sideOffset={4} align="end">
          <LeaveChannelEntityButton {...props} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export { LeaveOrgButton };
