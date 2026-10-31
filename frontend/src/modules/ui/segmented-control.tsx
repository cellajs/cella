import { Radio } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { cva, type VariantProps } from 'class-variance-authority';
import { type ComponentProps, useLayoutEffect, useRef } from 'react';
import { cn } from '~/utils/cn';

const trackVariants = cva(
  'relative isolate inline-flex w-fit max-w-full items-stretch gap-0.5 rounded-md border border-input bg-muted p-0.5 dark:bg-black/40',
  {
    variants: {
      size: {
        default: 'h-10 text-sm [--segment-px:--spacing(2.5)]',
        sm: 'h-9 text-sm [--segment-px:--spacing(2)]',
        xs: 'h-7 text-xs [--segment-px:--spacing(1.5)]',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

/** One weight in both states: a heavier active label would resize its segment and shift the others. */
export const segmentClassName =
  'focus-effect active:press relative inline-flex min-w-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-(--segment-px) font-medium text-muted-foreground transition-colors hover:text-foreground not-data-checked:not-aria-[current=page]:hover:bg-input/40 data-disabled:pointer-events-none data-disabled:opacity-50 data-checked:text-foreground aria-[current=page]:text-foreground';

/** Follows the active segment through attribute changes, so a caller's selection state never has to reach it. */
function SegmentedPill() {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const pill = ref.current;
    const track = pill?.parentElement;
    if (!pill || !track) return;

    const place = () => {
      const active = track.querySelector<HTMLElement>('[data-checked], [aria-current="page"]');
      pill.hidden = !active;
      if (!active) return;
      pill.style.width = `${active.offsetWidth}px`;
      pill.style.transform = `translateX(${active.offsetLeft}px)`;
    };

    place();
    // Flushes the first placement, so only later moves glide
    pill.getBoundingClientRect();
    pill.dataset.placed = '';

    const resizes = new ResizeObserver(place);
    resizes.observe(track);
    const changes = new MutationObserver(place);
    changes.observe(track, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-checked', 'aria-current'] });

    return () => {
      resizes.disconnect();
      changes.disconnect();
    };
  }, []);

  return (
    <span
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-ring inset-ring-input inset-y-0.5 left-0 -z-1 rounded-sm bg-background data-placed:transition-[width,transform] data-placed:duration-200 motion-reduce:transition-none dark:inset-ring-input-hover dark:bg-input"
    />
  );
}

/** One exclusive choice among a few short options, on one line. A selection cannot be cleared; arrow keys move it. */
export function SegmentedControl<Value>({
  className,
  size,
  children,
  ...props
}: RadioGroupPrimitive.Props<Value> & VariantProps<typeof trackVariants>) {
  return (
    <RadioGroupPrimitive data-slot="segmented-control" className={cn(trackVariants({ size }), className)} {...props}>
      {children}
      <SegmentedPill />
    </RadioGroupPrimitive>
  );
}

export function SegmentedControlItem({ className, ...props }: Radio.Root.Props) {
  return <Radio.Root data-slot="segmented-control-item" className={cn(segmentClassName, className)} {...props} />;
}

/** The same control for options that are routes: each child is a `<Link>` with `segmentClassName`, its active one `aria-current="page"`. */
export function SegmentedNav({ className, size, children, ...props }: ComponentProps<'nav'> & VariantProps<typeof trackVariants>) {
  return (
    <nav data-slot="segmented-nav" className={cn(trackVariants({ size }), className)} {...props}>
      {children}
      <SegmentedPill />
    </nav>
  );
}
