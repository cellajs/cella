import { XIcon } from 'lucide-react';
import type { ComponentProps, MouseEvent, ReactNode } from 'react';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

/** `lg` for a chip pressed by touch in a row of its own: taller, with a larger remove button and less space around it. */
export type ChipSize = 'default' | 'lg';

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
  /** Makes the value itself a button beside the remove button. Both keep focus where it is on a mouse press. */
  onPress?: () => void;
  /** Accessible name of the value's button, when its text alone does not say what a press does. */
  pressLabel?: string;
  /** Whether the value's button has opened what it controls. */
  isExpanded?: boolean;
  size?: ChipSize;
} & Removable;

const keepFocus = (event: MouseEvent) => event.preventDefault();

/**
 * A selected value as a pill, with an optional remove button. That button cannot sit inside another button, so a picker
 * lays its own trigger behind its chips and sets `pointer-events-none` on their row, which the chip's buttons opt out of.
 */
export function Chip({
  className,
  children,
  start,
  end,
  onRemove,
  removeLabel,
  onPress,
  pressLabel,
  isExpanded,
  size = 'default',
  ...props
}: ChipProps) {
  const value = <span className="truncate">{children}</span>;

  return (
    <span
      data-slot="chip"
      className={cn(
        'flex min-w-0 max-w-full items-center rounded-full border bg-border text-sm',
        size === 'lg' ? 'h-7' : 'h-6',
        start || onPress ? 'pl-0' : 'pl-2.5',
        onRemove ? 'pr-0.5' : 'pr-2.5',
        className,
      )}
      {...props}
    >
      {start && <span className="-my-px mr-1.5 -ml-px flex shrink-0">{start}</span>}
      {onPress ? (
        <button
          type="button"
          data-slot="chip-value"
          aria-label={pressLabel}
          aria-expanded={isExpanded}
          onMouseDown={keepFocus}
          onClick={onPress}
          className={cn(
            'focus-effect focus-inset pointer-events-auto flex h-full min-w-0 cursor-pointer items-center rounded-full pl-2.5 transition-colors hover:bg-foreground/8',
            size === 'lg' ? 'pr-1.5' : 'pr-2.5',
          )}
        >
          {value}
        </button>
      ) : (
        value
      )}
      {end && <span className="ml-1.5 shrink-0">{end}</span>}
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          press={false}
          aria-label={removeLabel}
          onMouseDown={onPress && keepFocus}
          onClick={onRemove}
          className={cn(
            'focus-inset pointer-events-auto shrink-0 rounded-full',
            size === 'lg' ? ['size-6', onPress && '-ml-1'] : ['size-5', !onPress && 'ml-0.5'],
          )}
        >
          <XIcon />
        </Button>
      )}
    </span>
  );
}
