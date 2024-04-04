import { Skeleton } from '../../ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/modules/ui/table';

interface DataTableSkeletonProps {
  rowCount?: number;
  cellHeight?: number;
  cellsCount?: number;
  cellsWidths?: string[];
  shrinkTable?: boolean;
}

export const DataTableSkeleton = ({
  cellsCount = 4,
  cellHeight = 40,
  cellsWidths = [],
  rowCount = 20,
  shrinkTable = false,
}: DataTableSkeletonProps) => {
  const renderCellHeight = cellHeight - 18;
  return (
    <div className="w-full space-y-3 overflow-auto">
      <Table>
        <TableHeader>
          {Array.from({ length: 1 }).map((_, i) => (
            <TableRow key={i.toString()} className="hover:bg-transparent">
              {Array.from({ length: cellsCount }).map((_, j) => (
                <TableHead
                  key={j.toString()}
                  style={{
                    width: cellsWidths[j] ? cellsWidths[j] : 'auto',
                    minWidth: shrinkTable ? cellsWidths[j] : 'auto',
                  }}
                >
                  <Skeleton className={'w-full mb-2 mt-2'} style={{ height: `${renderCellHeight}px` }} />
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {Array.from({ length: rowCount }).map((_, i) => (
            <TableRow key={i.toString()} className="hover:bg-transparent">
              {Array.from({ length: cellsCount }).map((_, j) => (
                <TableCell
                  key={j.toString()}
                  style={{
                    width: cellsWidths[j] ? cellsWidths[j] : 'auto',
                    minWidth: shrinkTable ? cellsWidths[j] : 'auto',
                  }}
                >
                  <Skeleton className={'w-full'} style={{ height: `${renderCellHeight}px` }} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
