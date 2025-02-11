import { FilterX } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';

interface TableCountProps {
  count?: number;

  type: string;
  isFiltered?: boolean;
  onResetFilters?: () => void;
  children?: ReactNode;
}
/**
 * Displays the count of items in a table
 */
const TableCount = ({ count = 0, type, isFiltered, children, onResetFilters }: TableCountProps) => {
  const { t } = useTranslation();

  return (
    <div className="max-sm:hidden text-muted-foreground text-sm flex items-center gap-2">
      {isFiltered && (
        <Button variant="ghost" onClick={onResetFilters} className="max-sm:hidden">
          <FilterX size={16} className="mr-1" />
          {t('common:clear')}
        </Button>
      )}
      <div>
        {new Intl.NumberFormat('de-DE').format(count)} {t(`common:${type}${count === 1 ? '' : 's'}`).toLowerCase()}
        {isFiltered && ` ${t('common:found')}`}
      </div>
      {children}
    </div>
  );
};

export default TableCount;
