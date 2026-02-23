import { DropdownMenuSeparator } from '@radix-ui/react-dropdown-menu';
import { SlidersHorizontalIcon } from 'lucide-react';
import { type Dispatch, type SetStateAction, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '~/modules/ui/dropdown-menu';

interface Props<TData> {
  columns: ColumnOrColumnGroup<TData>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<TData>[]>>;
  className?: string;
  isCompact?: boolean;
  setIsCompact?: (isCompact: boolean) => void;
  isEntityOnly?: boolean;
  setIsEntityOnly?: (isEntityOnly: boolean) => void;
}

export function ColumnsView<TData>({
  columns,
  setColumns,
  className = '',
  isCompact,
  setIsCompact,
  isEntityOnly,
  setIsEntityOnly,
}: Props<TData>) {
  const { t } = useTranslation();
  const [columnSearch, setColumnSearch] = useState('');

  const filteredColumns = columns.filter(
    (column) =>
      typeof column.name === 'string' &&
      column.name &&
      column.name.toLocaleLowerCase().includes(columnSearch.toLocaleLowerCase()),
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
              <Badge className="absolute -right-1 -top-1 flex h-2 w-2 justify-center p-0 z-10" />
            )}
            <SlidersHorizontalIcon className="size-4" />
            <span className="ml-1 max-xl:hidden">{t('common:view')}</span>
          </Button>
        </DropdownMenuTrigger>
      </TooltipButton>
      <DropdownMenuContent align="end" className="min-w-56 p-1" collisionPadding={16}>
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
        <DropdownMenuSeparator className="border-t my-1" />

        {/* Enabled a more compacted view */}
        {setIsCompact && isCompact !== undefined && (
          <DropdownMenuCheckboxItem
            className="min-h-8"
            onSelect={(e) => e.preventDefault()}
            checked={isCompact}
            onCheckedChange={() => setIsCompact(!isCompact)}
            aria-label={t('common:detailed_menu')}
          >
            {t('common:compact_view')}
          </DropdownMenuCheckboxItem>
        )}

        {/* Filter to entity-related operations only */}
        {setIsEntityOnly && isEntityOnly !== undefined && (
          <DropdownMenuCheckboxItem
            className="min-h-8"
            onSelect={(e) => e.preventDefault()}
            checked={isEntityOnly}
            onCheckedChange={() => setIsEntityOnly(!isEntityOnly)}
          >
            {t('common:entities_only')}
          </DropdownMenuCheckboxItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
