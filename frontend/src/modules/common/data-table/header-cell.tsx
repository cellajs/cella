import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { RenderHeaderCellProps } from 'react-data-grid';

const HeaderCell = <TData,>({ column, sortDirection }: RenderHeaderCellProps<TData>) => {
  if (!column.sortable) {
    return <div>{column.name}</div>;
  }

  return (
    <div className="flex items-center group cursor-pointer gap-2">
      <span>{column.name}</span>
      {sortDirection === 'DESC' ? (
        <ArrowDown className="h-4 w-4 opacity-50 group-hover:opacity-75" />
      ) : sortDirection === 'ASC' ? (
        <ArrowUp className="h-4 w-4 opacity-50 group-hover:opacity-75" />
      ) : (
        <ChevronsUpDown className="h-4 w-4 opacity-50 group-hover:opacity-75" />
      )}
    </div>
  );
};

export default HeaderCell;
