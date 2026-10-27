import { XIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

export type Removable =
  | { onRemove?: never; removeLabel?: never }
  | {
      onRemove: () => void;
      /** Accessible name of the remove button, such as "Remove {name}". */
      removeLabel: string;
    };

type ChipProps = Omit<ComponentProps<'span'>, 'children'> & {
  children: ReactNode;
  /** Media as tall as the chip, such as an avatar. It covers the chip's start edge and border, so the two read as one piece. */
  start?: ReactNode;
  /** Keeps its width while the text truncates, such as a count. */
  end?: ReactNode;
} & Removable;

/**
 * A selected value as a pill, with an optional remove button. That button cannot sit inside another button, so a picker
 * lays its own trigger behind its chips and sets `pointer-events-none` on their row, which the remove button opts out of.
 */
export function Chip({ className, children, start, end, onRemove, removeLabel, ...props }: ChipProps) {
  return (
    <span
      data-slot="chip"
      className={cn(
        'flex h-6 min-w-0 max-w-full items-center rounded-full border bg-border text-sm',
        start ? 'pl-0' : 'pl-2.5',
        onRemove ? 'pr-0.5' : 'pr-2.5',
        className,
      )}
      {...props}
    >
      {start && <span className="-my-px mr-1.5 -ml-px flex shrink-0">{start}</span>}
      <span className="truncate">{children}</span>
      {end && <span className="ml-1.5 shrink-0">{end}</span>}
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          press={false}
          aria-label={removeLabel}
          onClick={onRemove}
          className="focus-inset pointer-events-auto ml-0.5 size-5 shrink-0 rounded-full"
        >
          <XIcon />
        </Button>
      )}
    </span>
  );
}
