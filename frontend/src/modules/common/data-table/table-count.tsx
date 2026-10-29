import { FunnelXIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface TableCountProps {
  label: TKey;
  count: number | null;
  className?: string;
  isFiltered?: boolean;
  onResetFilters?: () => void;
  children?: ReactNode;
}

export function TableCount({ count, label, className, isFiltered, children, onResetFilters }: TableCountProps) {
  const { t } = useTranslation();

  return (
    // A phone stacks the count over its extra, and leaves the reset to the open search's Cancel
    <div className={cn('flex items-center gap-2 text-sm max-sm:flex-col max-sm:items-start max-sm:gap-0', className)}>
      {isFiltered && onResetFilters && (
        <Button variant="ghost" className="max-sm:hidden" onClick={onResetFilters}>
          <FunnelXIcon />
          {t('c:clear')}
        </Button>
      )}
      {/* Mounted while the count loads too: a status region announces changes only once it exists */}
      <div role="status" className="text-muted-foreground">
        {typeof count === 'number' && t(isFiltered ? 'c:resource_count_found' : 'c:resource_count', { count, resource: t(label, { count }) })}
      </div>
      {typeof count === 'number' && children}
    </div>
  );
}
