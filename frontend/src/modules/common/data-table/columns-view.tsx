import { SlidersHorizontalIcon } from 'lucide-react';
import { type Dispatch, type ReactNode, type SetStateAction, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/modules/ui/dropdown-menu';

interface Props<TData> {
  columns: ColumnOrColumnGroup<TData>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<TData>[]>>;
  className?: string;
  children?: ReactNode;
}

export function ColumnsView<TData>({ columns, setColumns, className = '', children }: Props<TData>) {
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
        <DropdownMenuTrigger render={<Button variant="outline" className="relative flex" />}>
          {filteredColumns.some((column) => column.hidden) && (
            <Badge className="absolute -right-1 -top-1 flex h-2 w-2 justify-center p-0 z-10" />
          )}
          <SlidersHorizontalIcon className="size-4" />
          <span className="ml-1 max-xl:hidden">{t('common:view')}</span>
        </DropdownMenuTrigger>
      </TooltipButton>
      <DropdownMenuContent align="end" className="min-w-56 p-1" collisionPadding={16}>
        {filteredColumns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.key}
            className="min-h-8"
            checked={!column.hidden}
            onCheckedChange={() =>
              setColumns((columns) =>
                columns.map((c) =>
                  c.name === column.name
                    ? {
                        ...c,
                        hidden: !c.hidden,
                      }
                    : c,
                ),
              )
            }
          >
            {column.name}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator className="border-t my-1 last:hidden" />
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
