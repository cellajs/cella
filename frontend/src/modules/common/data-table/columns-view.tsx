import { SlidersHorizontal } from 'lucide-react';
import { Dispatch, SetStateAction, useMemo, useState } from 'react';
import { ColumnOrColumnGroup as BaseColumnOrColumnGroup } from 'react-data-grid';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';

export type ColumnOrColumnGroup<TData> = BaseColumnOrColumnGroup<TData> & {
  key: string;
  visible?: boolean;
};

interface Props<TData> {
  columns: ColumnOrColumnGroup<TData>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<TData>[]>>;
}

const ColumnsView = <TData,>({ columns, setColumns }: Props<TData>) => {
  const [columnSearch, setColumnSearch] = useState('');

  const filteredColumns = useMemo(
    () =>
      columns.filter(
        (column) => typeof column.name === 'string' && column.name && column.name.toLocaleLowerCase().includes(columnSearch.toLocaleLowerCase()),
      ),
    [columns, columnSearch],
  );

  const height = useMemo(() => (filteredColumns.length > 5 ? 6 * 32 - 16 + 4 : filteredColumns.length * 32 + 8), [filteredColumns.length]);

  return (
    <DropdownMenu
      onOpenChange={() => {
        setColumnSearch('');
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="relative flex">
          {filteredColumns.some((column) => !column.visible) && (
            <Badge className="absolute -right-1.5 -top-1.5 flex h-4 w-4 justify-center rounded-full p-0">!</Badge>
          )}
          <SlidersHorizontal className="h-4 w-4" />
          <span className="ml-1 max-xs:hidden">View</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px] pt-2" collisionPadding={16}>
        <div className="overflow-y-auto relative" style={{ height }}>
          {filteredColumns.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.name as string}
              className="mx-1"
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
          <div className="sticky bottom-0 h-[8px] bg-gradient-to-t from-popover" />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ColumnsView;
