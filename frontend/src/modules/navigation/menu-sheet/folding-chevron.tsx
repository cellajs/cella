import type { IconComponent } from '~/modules/common/icons/types';
import { cn } from '~/utils/cn';

interface FoldingChevronProps {
  icon: IconComponent;
  /** Set while the row's unseen badge holds its place: it then widens in, moving the badge aside, while its host marked `group/chevron-host` has the pointer or keyboard focus. */
  folded: boolean;
  className?: string;
}

/** The chevron at the end of a menu row, which gives its place to the row's unseen badge so every badge ends on one line. */
export function FoldingChevron({ icon: Icon, folded, className }: FoldingChevronProps) {
  return (
    <span
      className={cn(
        'grid shrink-0 transition-[grid-template-columns,opacity] duration-200 ease-out motion-reduce:transition-none',
        folded
          ? 'grid-cols-[0fr] opacity-0 group-hover/chevron-host:grid-cols-[1fr] group-hover/chevron-host:opacity-100 group-focus-visible/chevron-host:grid-cols-[1fr] group-focus-visible/chevron-host:opacity-100'
          : 'grid-cols-[1fr]',
      )}
    >
      <span className="flex min-w-0 overflow-hidden">
        <Icon className={cn('shrink-0', className)} />
      </span>
    </span>
  );
}
