import { useLocation } from '@tanstack/react-router';
import { config } from 'config';
import { Copy, Info } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { dateShort } from '~/lib/utils';
import { Button } from '~/modules/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import type { Task } from '~/types/app';
import { AvatarWrap } from '../common/avatar-wrap';

const HeaderInfo = ({ task }: { task: Task }) => {
  const { t } = useTranslation();
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
          <Info size={16} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex flex-col font-light text-sm text-muted-foreground" align="start" side="top">
        <span>
          {t('common:updated_at')} : {dateShort(task.modifiedAt)}
        </span>
        {user && (
          <div className="inline-flex items-center gap-1">
            {t('common:updated_by')} :
            <AvatarWrap type="user" className="h-6 w-6" id={user.id} name={user.name} url={user.thumbnailUrl} />
            <span className="group-hover:underline underline-offset-4 truncate">{user.name || '-'}</span>
          </div>
        )}
        <span>
          {t('common:slug')} : {task.slug}
        </span>
        <div className="inline-flex items-center gap-1">
          <span className="truncate text-ellipsis overflow-hidden ">
            {t('app:share_link')} : {shareLink}
          </span>
          <Button
            onClick={() => copyToClipboard(shareLink)}
            aria-label="Copy"
            variant="ghost"
            className="secondary-foreground cursor-pointer"
            size="micro"
          >
            <Copy size={12} />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default HeaderInfo;
