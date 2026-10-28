import { DownloadIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { exportToCsv, exportToPdf } from '~/lib/export';
import { fetchAllRows } from '~/modules/common/data-table/fetch-all-rows';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import { uiStore } from '~/modules/ui/ui-store';
import { getRouter } from '~/routes/-router-instance';

interface ExportProps<TData> {
  /** Without extension; each format adds its own. */
  filename: string;
  columns: ColumnOrColumnGroup<TData>[];
  selectedRows?: TData[];
  fetchRows: (limit: number, offset: number) => Promise<TData[]>;
  className?: string;
}

type ExportFormat = 'csv' | 'pdf';

interface ExportItemProps {
  format: ExportFormat;
  /** The rows the item exports, shown muted beside the format. */
  note: string;
  disabled?: boolean;
  onClick: () => void;
}

function ExportItem({ format, note, disabled, onClick }: ExportItemProps) {
  return (
    <DropdownMenuItem onClick={onClick} disabled={disabled}>
      <span>{format.toUpperCase()}</span>
      <span className="text-muted-foreground text-xs">{note}</span>
    </DropdownMenuItem>
  );
}

export function Export<TData extends object>({ filename, columns, selectedRows, fetchRows, className }: ExportProps<TData>) {
  const { t } = useTranslation();
  const isOnline = useOnlineManager();

  // Only online menus offer the full export and the PDF, so neither handler checks the connection
  const download = (format: ExportFormat, rows: TData[]) => {
    const file = `${filename}.${format}`;
    if (format === 'csv') return exportToCsv(columns, rows, file);
    return exportToPdf(columns, rows, file, getRouter().state.location.pathname, uiStore.getState().mode);
  };
  const downloadAll = async (format: ExportFormat) => download(format, await fetchAllRows(fetchRows));

  const allRowsNote = t('c:all_rows').toLowerCase();
  const selectedNote = selectedRows?.length
    ? t('c:resource_count', { count: selectedRows.length, resource: t('c:selected') })
    : t('c:no_selection').toLowerCase();

  return (
    <DropdownMenu>
      <TooltipButton className={className} toolTipContent={t('c:export_pdf_csv')}>
        <DropdownMenuTrigger render={<Button variant="outline" className="flex" />}>
          <DownloadIcon />
          <span className="max-xl:hidden">{t('c:export')}</span>
        </DropdownMenuTrigger>
      </TooltipButton>
      <DropdownMenuContent align="end">
        {isOnline && (
          <>
            {/* Label the full-export pair so it reads apart from the selected-rows pair below */}
            <ExportItem format="csv" note={allRowsNote} onClick={() => downloadAll('csv')} />
            <ExportItem format="pdf" note={allRowsNote} onClick={() => downloadAll('pdf')} />
          </>
        )}
        {selectedRows && (
          <>
            <ExportItem format="csv" note={selectedNote} disabled={!selectedRows.length} onClick={() => download('csv', selectedRows)} />
            {isOnline && (
              <ExportItem format="pdf" note={selectedNote} disabled={!selectedRows.length} onClick={() => download('pdf', selectedRows)} />
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
