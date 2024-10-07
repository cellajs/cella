import { useLocation } from '@tanstack/react-router';
import { config } from 'config';
import { Check, Copy, Info, Link, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { Button } from '~/modules/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import type { Task } from '~/types/app';
import { dateShort } from '~/utils/date-short';
import { AvatarWrap } from '../common/avatar-wrap';

const HeaderInfo = ({ task }: { task: Task }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const { copyToClipboard } = useCopyToClipboard();

  const [open, setOpen] = useState(false);
  const [copyClicked, setCopyClicked] = useState(false);

  const handleCopy = () => {
    copyToClipboard(shareLink);
    setCopyClicked(true);
    setTimeout(() => setCopyClicked(false), 2000);
  };
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
          <Button onClick={handleCopy} aria-label="Copy" variant="ghost" className="py-1 cursor-pointer" size="xs">
            <div className="inline-flex gap-2 items-center">
              {copyClicked ? <Check className="text-success" size={14} /> : <Copy size={12} />}
              {copyClicked ? <span className="text-success">{t('app:copied')}!</span> : <span>{task.id}</span>}
            </div>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default HeaderInfo;
