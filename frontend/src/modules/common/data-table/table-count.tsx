import { FilterX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button';

interface TableCountProps {
  count?: number;
  type: string;
  isFiltered?: boolean;
  onResetFilters?: () => void;
}

const TableCount = ({ count, type, isFiltered, onResetFilters }: TableCountProps) => {
  const { t } = useTranslation();

  return (
    <div className="text-muted-foreground text-sm flex items-center gap-2">
      {count !== undefined && (
        <>
          {isFiltered && (
            <Button variant="ghost" onClick={onResetFilters} className="max-sm:hidden">
              <FilterX size={16} className="mr-1" />
              {t('common:clear_filter')}
            </Button>
          )}
          <div className="w-max ml-2">
            {new Intl.NumberFormat('de-DE').format(count)} {count === 1 ? t(`common:${type}`).toLowerCase() : t(`common:${type}s`).toLowerCase()}
            {isFiltered && ' '}
            {isFiltered && t('common:found')}
          </div>
        </>
      )}
    </div>
  );
};

export default TableCount;
