import { ChevronDownIcon } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { buttonVariants } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

/** Link class of a row with a chevron: the hover fill follows the whole `group/expand-row`, so pointing at the chevron keeps it, and being expanded adds no fill. */
export const expandRowLinkClass = cn(
  buttonVariants({ variant: null }),
  'group-hover/expand-row:bg-muted group-hover/expand-row:text-foreground dark:group-hover/expand-row:bg-muted/50',
);

/** ArrowRight opens and ArrowLeft closes the row from its focused link, without navigating. */
export function handleExpandKeys(event: KeyboardEvent, isExpanded: boolean, onToggle: () => void) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.key !== (isExpanded ? 'ArrowLeft' : 'ArrowRight')) return;
  event.preventDefault();
  onToggle();
}

interface RowExpandToggleProps {
  isExpanded: boolean;
  onToggle: () => void;
}

/**
 * The chevron at the end of a positioned `group/expand-row` whose label is a link: a click only opens or closes the row.
 * It stays out of the Tab order and the accessibility tree; the link carries `aria-expanded` and `handleExpandKeys`.
 */
export function RowExpandToggle({ isExpanded, onToggle }: RowExpandToggleProps) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      className="group/expand-toggle absolute inset-y-0 right-1 my-auto flex size-8 items-center justify-center"
      // Chrome focuses a clicked button; focus stays where it was
      onMouseDown={(event) => event.preventDefault()}
      onClick={onToggle}
    >
      <span className="flex size-6 items-center justify-center rounded-sm group-hover/expand-toggle:bg-foreground/10 group-active/expand-toggle:bg-foreground/10">
        <ChevronDownIcon className={cn('opacity-40 transition duration-200 group-hover/expand-toggle:opacity-100', isExpanded && 'rotate-180')} />
      </span>
    </button>
  );
}
