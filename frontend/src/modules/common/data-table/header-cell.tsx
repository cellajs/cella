import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { RenderHeaderCellProps } from 'react-data-grid';

export const HeaderCell = <TData,>({ column, sortDirection }: RenderHeaderCellProps<TData>) => {
  if (!column.sortable) {
    return <div>{column.name}</div>;
  }

  return (
    <div className='flex items-center cursor-pointer'>
      <span>{column.name}</span>
      {sortDirection === 'DESC' ? (
        <ArrowDown className="ml-2 h-4 w-4" />
      ) : sortDirection === 'ASC' ? (
        <ArrowUp className="ml-2 h-4 w-4" />
      ) : (
        <ChevronsUpDown className="ml-2 h-4 w-4" />
      )}
    </div>
  )
};

export default HeaderCell;
