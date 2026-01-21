import type { RenderHeaderCellProps } from '@cella/data-grid';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';

function HeaderCell<TData>({ column, sortDirection }: RenderHeaderCellProps<TData>) {
  if (!column.sortable) {
    return <div>{column.name}</div>;
  }

  return (
    <div className="flex items-center group cursor-pointer gap-2">
      <span>{column.name}</span>
      {sortDirection === 'DESC' ? (
        <ArrowDownIcon className="size-4 opacity-50 group-hover:opacity-75" />
      ) : sortDirection === 'ASC' ? (
        <ArrowUpIcon className="size-4 opacity-50 group-hover:opacity-75" />
      ) : (
        <ChevronsUpDownIcon className="size-4 opacity-50 group-hover:opacity-75" />
      )}
    </div>
  );
}

export default HeaderCell;
