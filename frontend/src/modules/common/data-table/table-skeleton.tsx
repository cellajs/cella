import { useEffect, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/modules/ui/table';
import { Skeleton } from '../../ui/skeleton';

interface DataTableSkeletonProps {
  rowCount?: number;
  cellHeight?: number;
  columnCount?: number;
  cellsWidths?: string[];
  shrinkTable?: boolean;
}

export const DataTableSkeleton = ({
  columnCount = 4,
  cellHeight = 40,
  cellsWidths = [],
  rowCount = 20,
  shrinkTable = false,
}: DataTableSkeletonProps) => {
  const renderCellHeight = cellHeight - 18;
  const [isVisible, setIsVisible] = useState(false);

  // Delay skeleton appearance to avoid flickering
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 200);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`w-full space-y-3 overflow-auto transition-opacity ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
      <Table>
        <TableHeader>
          {Array.from({ length: 1 }).map((_, i) => (
            <TableRow key={i.toString()} className="hover:bg-transparent">
              {Array.from({ length: columnCount }).map((_, j) => (
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
              {Array.from({ length: columnCount }).map((_, j) => (
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
