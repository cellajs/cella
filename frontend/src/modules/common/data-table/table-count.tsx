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
    // A phone stacks the count over its extra
    <div className={cn('flex items-center gap-2 text-sm max-sm:flex-col max-sm:items-start max-sm:gap-0', className)}>
      {/* Mounted while the count loads too: a status region announces changes only once it exists */}
      <div role="status" className="whitespace-nowrap text-muted-foreground">
        {typeof count === 'number' && t('c:resource_count', { count, resource: t(label, { count }) })}
      </div>
      {typeof count === 'number' && children}
    </div>
  );
}
