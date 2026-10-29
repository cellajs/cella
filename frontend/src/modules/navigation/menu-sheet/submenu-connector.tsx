import { cn } from '~/utils/cn';

/**
 * Two dots spread evenly over the gap above a submenu row's avatar, joining it to the one above; `className` sets the
 * gap's top and height. A row renders it after its fill and after the row above, so neither row's hover covers it.
 */
export function SubmenuConnector({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('pointer-events-none absolute left-6.75 flex w-0.5 flex-col justify-evenly text-foreground opacity-50', className)}
    >
      <span className="size-0.5 rounded-full bg-current" />
      <span className="size-0.5 rounded-full bg-current" />
    </span>
  );
}
