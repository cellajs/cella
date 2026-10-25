import { ChevronDownIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

/** The chevron that marks a field as a picker; a field that can't be one button, such as a chip row, places it itself. */
export function InputTriggerChevron({ className }: { className?: string }) {
  return <ChevronDownIcon className={cn('shrink-0 text-muted-foreground/70', className)} />;
}

/** An input-styled button that opens a picker: its content at the start, a chevron at the end. */
export function InputTriggerButton({ className, children, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button variant="input" className={cn('justify-between font-normal', className)} {...props}>
      {children}
      <InputTriggerChevron />
    </Button>
  );
}
