import { CircleQuestionMarkIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { HelpCollapse, HelpToggle } from '~/modules/ui/help-toggle';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { cn } from '~/utils/cn';

interface HelpTextProps {
  children: React.ReactNode;
  content: React.ReactNode;
  className?: string;
  type?: 'popover';
}

export function HelpText({ content, children, className, type }: HelpTextProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (type === 'popover') {
    return (
      <div className={cn('mb-4 flex items-center gap-2', className)}>
        {children}
        <Popover>
          <PopoverTrigger
            render={<Button variant="ghost" size="icon" press={false} className="size-6 opacity-50 hover:opacity-100" aria-label={t('c:help')} />}
          >
            <CircleQuestionMarkIcon />
          </PopoverTrigger>
          <PopoverContent className="w-80 max-w-full text-muted-foreground text-sm" align="start" side="top" collisionPadding={8}>
            {content}
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <div className={cn('mb-4 flex flex-col', className)}>
      <div className="flex items-center gap-2">
        {children}
        <HelpToggle open={open} onToggle={() => setOpen(!open)} />
      </div>
      <HelpCollapse open={open}>{content}</HelpCollapse>
    </div>
  );
}
