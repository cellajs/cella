import { FilterX } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface TableCountProps {
  label: string;
  count: number | null;
  className?: string;
  isFiltered?: boolean;
  onResetFilters?: () => void;
  children?: ReactNode;
}
/**
 * Displays the count of items in a table
 */
const TableCount = ({ count, label, className, isFiltered, children, onResetFilters }: TableCountProps) => {
  const { t } = useTranslation();

  return (
    <div className={cn('max-sm:hidden text-sm flex items-center gap-2', className)}>
      {isFiltered && (
        <Button variant="ghost" onClick={onResetFilters} className="max-sm:hidden">
          <FilterX size={16} className="mr-2" />
          {t('common:clear')}
        </Button>
      )}
      {typeof count === 'number' && (
        <div className="flex items-center gap-1 text-muted-foreground">
          <span>{new Intl.NumberFormat('de-DE').format(count)}</span>
          <span>{t(label, { count }).toLowerCase()}</span>
          {isFiltered && <span>{` ${t('common:found')}`}</span>}
        </div>
      )}
      {children}
    </div>
  );
};

export default TableCount;
