import { FilterX } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';

interface TableCountProps {
  type: string;
  count?: number;
  isFiltered?: boolean;
  onResetFilters?: () => void;
  children?: ReactNode;
}
/**
 * Displays the count of items in a table
 */
const TableCount = ({ count, type, isFiltered, children, onResetFilters }: TableCountProps) => {
  const { t } = useTranslation();

  return (
    <div className="max-sm:hidden text-muted-foreground text-sm flex items-center gap-2">
      {isFiltered && (
        <Button variant="ghost" onClick={onResetFilters} className="max-sm:hidden">
          <FilterX size={16} className="mr-2" />
          {t('common:clear')}
        </Button>
      )}
      {count !== undefined && (
        <div className="flex items-center gap-1">
          <span>{new Intl.NumberFormat('de-DE').format(count)}</span>
          <span>{t(`common:${type}${count === 1 ? '' : 's'}`).toLowerCase()}</span>
          <span>{isFiltered && ` ${t('common:found')}`}</span>
        </div>
      )}
      {children}
    </div>
  );
};

export default TableCount;
