import { type ReactNode, useState } from 'react';
import { HelpCollapse, HelpToggle } from '~/modules/ui/help-toggle';
import { cn } from '~/utils/cn';

interface HelpTextProps {
  children: ReactNode;
  content: ReactNode;
  className?: string;
  action?: ReactNode;
  /** Of the help toggle. */
  tabIndex?: number;
}

export function HelpText({ content, children, className, action, tabIndex }: HelpTextProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex items-center gap-2">
        {children}
        <HelpToggle open={open} onToggle={() => setOpen((prev) => !prev)} tabIndex={tabIndex} />
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <HelpCollapse open={open}>{content}</HelpCollapse>
    </div>
  );
}
