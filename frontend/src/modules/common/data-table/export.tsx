import { ReactElement } from 'react';
import { exportToCsv, exportToPdf } from '~/lib/export';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';

interface Props<R> {
  filename: string;
  columns: { key: string; name: ReactElement | string }[];
  selectedRows: R[];
  fetchRows: (limit: number) => Promise<R[]>;
}

const Export = <R extends object>({ filename, columns, selectedRows, fetchRows }: Props<R>) => {
  const onExport = async (type: 'csv' | 'pdf', selected: boolean) => {
    if (selected) {
      if (type === 'csv') {
        exportToCsv(columns, selectedRows, `${filename}.csv`);
      } else {
        exportToPdf(columns, selectedRows, `${filename}.pdf`);
      }
    } else {
      const rows = await fetchRows(1000);

      if (type === 'csv') {
        exportToCsv(columns, rows, `${filename}.csv`);
      } else {
        exportToPdf(columns, rows, `${filename}.pdf`);
      }
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="flex">
          <span className="max-xs:hidden">Export</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => onExport('csv', true)} disabled={selectedRows.length === 0}>
          Export selected to CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('csv', false)}>Export 1000 to CSV</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('pdf', true)} disabled={selectedRows.length === 0}>
          Export selected to PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('pdf', false)}>Export 1000 to PDF</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default Export;
