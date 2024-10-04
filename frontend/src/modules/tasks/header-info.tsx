import { useLocation } from '@tanstack/react-router';
import { config } from 'config';
import { Copy, Info, Link, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { Button } from '~/modules/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import type { Task } from '~/types/app';
import { dateShort } from '~/utils/date-short';
import { AvatarWrap } from '../common/avatar-wrap';

const HeaderInfo = ({ task }: { task: Task }) => {
  const location = useLocation();
  const { copyToClipboard } = useCopyToClipboard();

  const [open, setOpen] = useState(false);

  const user = task.modifiedBy;
  const shareLink = `${config.frontendUrl}${location.pathname}?taskIdPreview=${task.id}`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          onClick={() => setOpen(true)}
          aria-label="Info"
          variant="ghost"
          className="cursor-pointer text-secondary-foreground/50 hover:text-secondary-foreground"
          size="xs"
        >
          <Info size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-2 font-light text-sm text-muted-foreground" align="start" side="top">
        <div className="inline-flex">
          <Pencil size={16} className="opacity-50 mr-3" />
          {user && <AvatarWrap type="user" className="h-5 w-5 mr-2" id={user.id} name={user.name} url={user.thumbnailUrl} />}
          {dateShort(task.modifiedAt)}
        </div>
        <div className="flex items-center">
          <Link size={14} className="opacity-50 mr-2 w-4 h-4" />
          <Button onClick={() => copyToClipboard(shareLink)} aria-label="Copy" variant="ghost" className="py-1 cursor-pointer" size="xs">
            <Copy size={12} className="mr-2" />
            {task.id}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default HeaderInfo;
