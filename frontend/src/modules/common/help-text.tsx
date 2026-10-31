import { type ReactNode, useState } from 'react';
import { HelpCollapse, HelpToggle } from '~/modules/ui/help-toggle';
import { cn } from '~/utils/cn';

interface HelpTextProps {
  children: ReactNode;
  content: ReactNode;
  className?: string;
  /** At the end of the title row, such as an add button. */
  action?: ReactNode;
  /** Of the help toggle, for a table cell that takes it from `renderCell`. */
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
