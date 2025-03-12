import { FoldHorizontal, SlidersHorizontal, UnfoldHorizontal } from 'lucide-react';
import { type Dispatch, type SetStateAction, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';

interface Props<TData> {
  columns: ColumnOrColumnGroup<TData>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<TData>[]>>;
  className?: string;
  highDensity?: boolean;
  toggleDensityView?: (highDensity: boolean) => void;
}

const ColumnsView = <TData,>({ columns, setColumns, className = '', highDensity, toggleDensityView }: Props<TData>) => {
  const { t } = useTranslation();
  const [columnSearch, setColumnSearch] = useState('');

  const filteredColumns = useMemo(
    () =>
      columns.filter(
        (column) => typeof column.name === 'string' && column.name && column.name.toLocaleLowerCase().includes(columnSearch.toLocaleLowerCase()),
      ),
    [columns, columnSearch],
  );

  return (
    <DropdownMenu
      onOpenChange={() => {
        setColumnSearch('');
      }}
    >
      <TooltipButton className={className} toolTipContent={t('common:columns_view')}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="relative flex">
            {filteredColumns.some((column) => !column.visible) && (
              <Badge className="absolute -right-1 -top-1 flex h-2 w-2 justify-center p-0 z-100" />
            )}
            <SlidersHorizontal className="h-4 w-4" />
            <span className="ml-1 max-xl:hidden">{t('common:view')}</span>
          </Button>
        </DropdownMenuTrigger>
      </TooltipButton>
      <DropdownMenuContent align="end" className="min-w-56" collisionPadding={16}>
        {filteredColumns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.key}
            className="min-h-8"
            checked={column.visible}
            onCheckedChange={() =>
              setColumns((columns) =>
                columns.map((c) =>
                  c.name === column.name
                    ? {
                        ...c,
                        visible: !c.visible,
                      }
                    : c,
                ),
              )
            }
            onSelect={(e) => e.preventDefault()}
          >
            {column.name}
          </DropdownMenuCheckboxItem>
        ))}
        {/* Not finished, therefore hidden */}
        {toggleDensityView && highDensity !== undefined && (
          <Button variant="outline" onClick={() => toggleDensityView(!highDensity)} className="hidden w-full mt-3 gap-2" size="sm">
            {highDensity ? <UnfoldHorizontal size={16} /> : <FoldHorizontal size={16} />}
            <span>{highDensity ? t('common:normal_density') : t('common:high_density')}</span>
          </Button>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ColumnsView;
