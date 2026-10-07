import { useState } from 'react';
import { HelpCollapse, HelpToggle } from '~/modules/ui/help-toggle';
import { cn } from '~/utils/cn';

interface HelpTextProps {
  children: React.ReactNode;
  content: React.ReactNode;
  className?: string;
}

export function HelpText({ content, children, className }: HelpTextProps) {
  const [open, setOpen] = useState(false);

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
