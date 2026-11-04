import { CircleAlertIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '~/utils/cn';

/** A muted line behind a warning icon, for what the user should know before acting. */
export function WarningNote({ className, children, ...props }: ComponentProps<'p'>) {
  return (
    <p className={cn('text-muted-foreground flex items-start gap-2 text-sm font-normal', className)} {...props}>
      <span className="flex h-lh shrink-0 items-center">
        <CircleAlertIcon className="text-warning size-3.5" />
      </span>
      <span>{children}</span>
    </p>
  );
}
