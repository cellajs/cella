import { CircleAlertIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '~/utils/cn';

/** A muted line behind a warning icon, for what the user should know before acting. */
export function WarningNote({ className, children, ...props }: ComponentProps<'p'>) {
  return (
    <p className={cn('flex items-start gap-2 font-normal text-muted-foreground text-sm', className)} {...props}>
      {/* One line tall, so the icon stays on the first line when the text wraps */}
      <span className="flex h-lh shrink-0 items-center">
        <CircleAlertIcon className="size-3.5 text-warning" />
      </span>
      <span>{children}</span>
    </p>
  );
}
