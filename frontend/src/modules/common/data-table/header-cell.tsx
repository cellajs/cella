import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { RenderHeaderCellProps } from 'react-data-grid';

const HeaderCell = <TData,>({ column, sortDirection }: RenderHeaderCellProps<TData>) => {
  if (!column.sortable) {
    return <div>{column.name}</div>;
  }

  return (
    <div className='flex items-center cursor-pointer justify-between'>
      <span>{column.name}</span>
      {sortDirection === 'DESC' ? (
        <ArrowDown className="h-4 w-4" />
      ) : sortDirection === 'ASC' ? (
        <ArrowUp className="h-4 w-4" />
      ) : (
        <ChevronsUpDown className="h-4 w-4" />
      )}
    </div>
  )
};

export default HeaderCell;
