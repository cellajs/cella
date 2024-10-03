import { ChevronUp, HelpCircle } from 'lucide-react';
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

const HelpText = ({ content, children, className, type }: HelpTextProps) => {
  const [collapsed, setCollapsed] = useState(true);

  if (type === 'popover') {
    return (
      <div className="flex items-center gap-2 mb-4">
        {children}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="w-6 h-6 opacity-50 hover:opacity-100 active:!translate-y-0">
              <HelpCircle size={16} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 font-light text-sm text-muted-foreground" align="start" side="top">
            {content}
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col mb-4', className)}>
      <div className="flex items-center gap-2">
        {children}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="w-6 h-6 opacity-50 hover:opacity-100 active:!translate-y-0"
        >
          {collapsed && <HelpCircle size={16} />}
          {!collapsed && <ChevronUp size={16} />}
        </Button>
      </div>
      <div className="font-light text-sm text-muted-foreground">{!collapsed && <span>{content}</span>}</div>
    </div>
  );
};

export default HelpText;
