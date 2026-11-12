import { cn } from '~/utils/cn';

/**
 * Dots spread evenly over the gap above a sub-row's avatar, joining it to the one above: two over the 1rem between two
 * avatars, three over the first sub-row's gap under a parent's icon, which sits inside its box so that gap starts higher.
 * `className` overrides the gap for the Hidden toggle. It paints over both rows' hover fills: a row renders it after its
 * own fill and after the row above.
 */
export function SubmenuConnector({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'text-faint-foreground pointer-events-none absolute -top-2 left-6.75 flex h-4 w-0.5 flex-col justify-evenly group-data-[icon=true]/parent:group-first/row:-top-4 group-data-[icon=true]/parent:group-first/row:h-6',
        className,
      )}
    >
      <span className="size-0.5 rounded-full bg-current" />
      <span className="size-0.5 rounded-full bg-current" />
      <span className="hidden size-0.5 rounded-full bg-current group-data-[icon=true]/parent:group-first/row:block" />
    </span>
  );
}
