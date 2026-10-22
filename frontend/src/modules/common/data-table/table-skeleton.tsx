import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useMountedState } from '~/hooks/use-mounted-state';
import { Skeleton } from '~/modules/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/modules/ui/table';
import { cn } from '~/utils/cn';

interface DataTableSkeletonProps {
  cellHeight?: number;
  columnCount?: number;
  /** Widths of the first columns; the rest size themselves. */
  cellsWidths?: string[];
}

const emptyCellWidths: string[] = [];
/** Keys of the placeholder rows, which never reorder. */
const rowKeys = Array.from({ length: 20 }, (_, i) => i);

export function DataTableSkeleton({ columnCount = 4, cellHeight = 40, cellsWidths = emptyCellWidths }: DataTableSkeletonProps) {
  const renderCellHeight = cellHeight - 18;
  const { hasStarted } = useMountedState();
  const isMobile = useBreakpointBelow('sm', false);
  const columns = Array.from({ length: isMobile ? Math.min(columnCount, 3) : columnCount }, (_, j) => ({ key: j, style: { width: cellsWidths[j] } }));

  return (
    <div className={cn('w-full space-y-3 overflow-auto transition-opacity duration-500', hasStarted ? 'opacity-100' : 'opacity-0')}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map(({ key, style }) => (
              <TableHead key={key} style={style}>
                <Skeleton className={'mt-2 mb-2 w-full'} style={{ height: `${renderCellHeight}px` }} />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rowKeys.map((rowKey) => (
            <TableRow key={rowKey} className="hover:bg-transparent">
              {columns.map(({ key, style }) => (
                <TableCell key={key} style={style}>
                  <Skeleton className={'w-full'} style={{ height: `${renderCellHeight}px` }} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
