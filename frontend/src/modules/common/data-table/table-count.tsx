import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { countText } from '~/modules/common/search-chips/count-text';
import { cn } from '~/utils/cn';

interface TableCountProps {
  label: TKey;
  /** Null while it loads */
  count: number | null;
  /** The count is what a search found: "3 members found". */
  found?: boolean;
  className?: string;
  children?: ReactNode;
}

export function TableCount({ count, found, label, className, children }: TableCountProps) {
  const { t } = useTranslation();

  return (
    // Out of the row while empty so a flex gap skips it, and for a search that found nothing, which the list's own empty
    // state tells; display none would drop the status region from the accessibility tree
    <div className={cn('flex min-w-0 items-center gap-1.5 text-sm', (typeof count !== 'number' || (found && count === 0)) && 'sr-only', className)}>
      <div role="status" className="text-muted-foreground truncate">
        {typeof count === 'number' && countText(t, { count, resource: label }, { found })}
      </div>
      {typeof count === 'number' && children}
    </div>
  );
}
