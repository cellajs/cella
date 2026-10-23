import { CircleAlertIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '~/utils/cn';

interface WarningNoteProps {
  className?: string;
  children: ReactNode;
}

/** A muted line behind a warning icon, for what the user should know before acting. */
export function WarningNote({ className, children }: WarningNoteProps) {
  return (
    <p className={cn('flex items-center gap-2', className)}>
      <CircleAlertIcon className="size-3.5 shrink-0 text-warning" />
      <span className="text-muted-foreground text-sm">{children}</span>
    </p>
  );
}
