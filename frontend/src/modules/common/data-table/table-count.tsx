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
    <div className={cn('flex items-center gap-2 text-sm max-sm:hidden', className)}>
      {isFiltered && (
        <Button variant="ghost" onClick={onResetFilters}>
          <FunnelXIcon />
          {t('c:clear')}
        </Button>
      )}
      {typeof count === 'number' && (
        <>
          <div className="text-muted-foreground">
            {t(isFiltered ? 'c:resource_count_found' : 'c:resource_count', { count, resource: t(label, { count }) })}
          </div>
          {children}
        </>
      )}
    </div>
  );
}
