import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { cn } from '~/utils/cn';

interface TableCountProps {
  label: TKey;
  /** The list's total; null while it loads or while a search shows its own count. */
  count: number | null;
  className?: string;
  children?: ReactNode;
}

export function TableCount({ count, label, className, children }: TableCountProps) {
  const { t } = useTranslation();

  return (
    // Out of the row while empty so a flex gap skips it; display none would drop the status region from the accessibility tree
    <div className={cn('flex min-w-0 items-center gap-1.5 text-sm', typeof count !== 'number' && 'sr-only', className)}>
      {/* Mounted while the count loads too: a status region announces changes only once it exists */}
      <div role="status" className="truncate text-muted-foreground">
        {typeof count === 'number' && t('c:resource_count', { count, resource: t(label, { count }) })}
      </div>
      {typeof count === 'number' && children}
    </div>
  );
}
