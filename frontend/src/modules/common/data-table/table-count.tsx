import { FilterX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button';

interface TableCountProps {
  count?: number;
  singular: string;
  plural: string;
  isFiltered?: boolean;
  onResetFilters?: () => void;
}

const TableCount = ({ count, singular, plural, isFiltered, onResetFilters }: TableCountProps) => {
  const { t } = useTranslation();

  return (
    <div className="text-muted-foreground text-sm flex items-center">
      {count !== undefined && (
        <>
          {isFiltered && (
            <Button variant="ghost" onClick={onResetFilters} className="mr-2">
              <FilterX size={16} className="mr-1" />
              {t('common:clear_filter')}
            </Button>
          )}
          <div className="w-max px-2">
            {new Intl.NumberFormat('de-DE').format(count)} {count === 1 ? singular : plural}
            {isFiltered && ' '}
            {isFiltered && t('common:found')}
          </div>
        </>
      )}
    </div>
  );
};

export default TableCount;
