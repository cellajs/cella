import { ChevronUpIcon, HelpCircleIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '~/modules/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { cn } from '~/utils/cn';

interface HelpTextProps {
  children: React.ReactNode;
  content: React.ReactNode;
  className?: string;
  type?: 'popover';
}

export function HelpText({ content, children, className, type }: HelpTextProps) {
  const [collapsed, setCollapsed] = useState(true);

  if (type === 'popover') {
    return (
      <div className="mb-4 flex items-center gap-2">
        {children}
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-6 opacity-50 hover:opacity-100 active:translate-y-0!"
              />
            }
          >
            <HelpCircleIcon size={16} />
          </PopoverTrigger>
          <PopoverContent className="w-80 text-muted-foreground text-sm" align="start" side="top">
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="size-6 opacity-50 hover:opacity-100 active:translate-y-0!"
        >
          {collapsed && <HelpCircleIcon size={16} />}
          {!collapsed && <ChevronUpIcon size={16} />}
        </Button>
      </div>
      <div className="text-muted-foreground text-sm">{!collapsed && <span>{content}</span>}</div>
    </div>
  );
}
