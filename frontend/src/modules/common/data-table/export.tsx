import { Download } from 'lucide-react';
import { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
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
  const { t } = useTranslation();

  const onExport = async (type: 'csv' | 'pdf', selected: boolean) => {
    const rows = selected ? selectedRows : await fetchRows(1000);
    const filenameWithExtension = `${filename}.${type}`;

    if (type === 'csv') return exportToCsv(columns, rows, filenameWithExtension);

    return exportToPdf(columns, rows, filenameWithExtension);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="flex max-xs:hidden"
          onClick={() => {
            toast.error(t('common:error.image_upload_failed'));
          }}
        >
          <Download size={16} />
          <span className="ml-1">Export</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => onExport('csv', false)}>
          <span>CSV</span>
          <span className="ml-2 font-light text-xs opacity-75">max 1k rows</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('pdf', false)}>
          <span>PDF</span>
          <span className="ml-2 font-light text-xs opacity-75">max 1k rows</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('csv', true)} disabled={selectedRows.length === 0}>
          <span>CSV</span>
          <span className="ml-2 font-light text-xs opacity-75">{selectedRows.length ? `${selectedRows.length} selected` : 'only selected'}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('pdf', true)} disabled={selectedRows.length === 0}>
          <span>PDF</span>
          <span className="ml-2 font-light text-xs opacity-75">{selectedRows.length ? `${selectedRows.length} selected` : 'only selected'}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default Export;
