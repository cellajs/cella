import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useMountedState } from '~/hooks/use-mounted-state';
import { Skeleton } from '~/modules/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/modules/ui/table';

interface DataTableSkeletonProps {
  rowCount?: number;
  cellHeight?: number;
  columnCount?: number;
  cellsWidths?: string[];
  shrinkTable?: boolean;
}

const EMPTY_CELL_WIDTHS: string[] = [];

export const DataTableSkeleton = ({
  columnCount = 4,
  cellHeight = 40,
  cellsWidths = EMPTY_CELL_WIDTHS,
  rowCount = 20,
  shrinkTable = false,
}: DataTableSkeletonProps) => {
  const renderCellHeight = cellHeight - 18;
  const { hasMounted } = useMountedState();
  const isMobile = useBreakpointBelow('sm', false);
  const effectiveColumnCount = isMobile ? Math.min(columnCount, 3) : columnCount;

  return (
    <div
      className={`w-full space-y-3 overflow-auto duration-500 transition-opacity ${hasMounted ? 'opacity-100' : 'opacity-0'}`}
    >
      <Table>
        <TableHeader>
          {Array.from({ length: 1 }).map((_, i) => (
            <TableRow key={i.toString()} className="hover:bg-transparent">
              {Array.from({ length: effectiveColumnCount }).map((_, j) => (
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
              {Array.from({ length: effectiveColumnCount }).map((_, j) => (
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
