import { Skeleton } from './skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/modules/ui/table';

interface DataTableSkeletonProps {
  /**
   * The number of rows in the table.
   * @default 20
   * @type number | undefined
   */
  rowCount?: number;

  /**
   * The height of each cell in px.
   * @default 36
   * @type number | undefined
   */
  cellHight?: number;

  /**
   * The number of showed columns.
   * @default 4
   * @type number | undefined
   */
  cellsCount?: number;

  /**
   * The width of each cell in the table.
   * The length of the array is set to columnCount.
   * Any valid CSS width value is accepted.
   * @default []
   * @type string[] | undefined
   */
  cellsWidths?: string[];

  /**
   * Flag to prevent the table from shrinking to fit the content.
   * @default false
   * @type boolean | undefined
   */
  shrinkTable?: boolean;
}

export const DataTableSkeleton = ({
  cellsCount = 4,
  cellHight = 8,
  cellsWidths = [],
  rowCount = 20,
  shrinkTable = false,
}: DataTableSkeletonProps) => {
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
                  <Skeleton className={'w-full mb-2 mt-2'} style={{ height: `${cellHight}px` }} />
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
                  <Skeleton className={'w-full'} style={{ height: `${cellHight}px` }} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
