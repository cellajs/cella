import { ChevronDownIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

/** An input-styled button that opens a picker */
export function InputTriggerButton({ className, children, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button variant="input" className={cn('justify-between font-normal', className)} {...props}>
      {children}
      <ChevronDownIcon className="text-faint-foreground shrink-0" />
    </Button>
  );
}
