import { ChevronDownIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

/** An input-styled button that opens a picker: its content at the start, a chevron at the end. */
export function InputTriggerButton({ className, children, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button variant="input" className={cn('justify-between font-normal', className)} {...props}>
      {children}
      <ChevronDownIcon className="shrink-0 text-muted-foreground/70" />
    </Button>
  );
}
