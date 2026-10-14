import { XIcon } from 'lucide-react';
import type * as React from 'react';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

type Removable =
  | { onRemove?: never; removeLabel?: never }
  | {
      onRemove: () => void;
      /** Accessible name of the remove button, such as "Remove {name}". */
      removeLabel: string;
    };

type ChipProps = Omit<React.ComponentProps<'span'>, 'children'> & { children: React.ReactNode } & Removable;

/**
 * A selected value shown as a pill, such as an email or a label, with an optional remove button. The remove button is a
 * real button, so it cannot sit inside another button: a picker that shows its chips lays its own trigger behind them
 * and sets `pointer-events-none` on the chip row, which the remove button opts back out of.
 */
export function Chip({ className, children, onRemove, removeLabel, ...props }: ChipProps) {
  return (
    <span
      data-slot="chip"
      className={cn(
        'flex h-6 min-w-0 max-w-full items-center rounded-full border bg-border pl-2.5 text-sm',
        onRemove ? 'pr-0.5' : 'pr-2.5',
        className,
      )}
      {...props}
    >
      <span className="truncate">{children}</span>
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="micro"
          press={false}
          aria-label={removeLabel}
          onClick={onRemove}
          className="focus-inset pointer-events-auto ml-0.5 size-5 shrink-0 rounded-full p-0 opacity-70 hover:opacity-100"
        >
          <XIcon strokeWidth={3} />
        </Button>
      )}
    </span>
  );
}
