import { FilterX } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';

interface TableCountProps {
  count?: number;

  type: string;
  isFiltered?: boolean;
  onResetFilters: () => void;
  children?: ReactNode;
}

const TableCount = ({ count = 0, type, isFiltered, children, onResetFilters }: TableCountProps) => {
  const { t } = useTranslation();

  return (
    <div className="max-sm:hidden text-muted-foreground text-sm  flex items-center gap-3 pr-2">
      {isFiltered && (
        <Button variant="ghost" onClick={onResetFilters} className="max-sm:hidden">
          <FilterX size={16} className="mr-1" />
          {t('common:clear')}
        </Button>
      )}
      <div className="flex flex-col gap-1 w-max md:flex-row md:gap-3">
        <>
          {new Intl.NumberFormat('de-DE').format(count)} {t(`common:${type}${count === 1 ? '' : 's'}`).toLowerCase()}
          {isFiltered && ` ${t('common:found')}`}
        </>
        {children}
      </div>
    </div>
  );
};

export default TableCount;
