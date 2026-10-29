import { DownloadIcon, SlidersHorizontalIcon } from 'lucide-react';
import { type Dispatch, Fragment, type ReactNode, type SetStateAction, useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentBreakpoint } from '~/hooks/use-breakpoints';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { exportToCsv, exportToPdf } from '~/lib/export';
import type { TKey } from '~/lib/i18n-locales';
import { breakpointOrder } from '~/modules/common/data-grid/utils/breakpoint-utils';
import { fetchAllRows } from '~/modules/common/data-table/fetch-all-rows';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { DropdownActionGroup, DropdownActionItem, DropdownActionSeparator } from '~/modules/common/dropdowner/dropdown-action-item';
import { DropdownSelectItem } from '~/modules/common/dropdowner/dropdown-select-item';
import { DropdownToggleItem } from '~/modules/common/dropdowner/dropdown-toggle-item';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import type { IconComponent } from '~/modules/common/icons/types';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { uiStore } from '~/modules/ui/ui-store';
import { getRouter } from '~/routes/-router-instance';

export interface ViewMenuSort {
  options: readonly { name: TKey; value: string; icon: IconComponent }[];
  value: string;
  onChange: (value: string) => void;
}

export interface ViewMenuExport<TRow> {
  /** Without extension; each format adds its own. */
  filename: string;
  fetchRows: (limit: number, offset: number) => Promise<TRow[]>;
  selectedRows?: TRow[];
}

interface ViewMenuProps<TRow extends object> {
  sort?: ViewMenuSort;
  columns?: ColumnOrColumnGroup<TRow>[];
  setColumns?: Dispatch<SetStateAction<ColumnOrColumnGroup<TRow>[]>>;
  /** Needs `columns`, which name what an export writes. */
  export?: ViewMenuExport<TRow>;
  className?: string;
  /** App rows after the built-in sections, as dropdowner items such as `DropdownToggleItem`. */
  children?: ReactNode;
}

type ExportFormat = 'csv' | 'pdf';

/** Whether the grid shows `column` at breakpoint index `bp`; a column it hides there has nothing to toggle. */
function isShownAt<TRow>(column: ColumnOrColumnGroup<TRow>, bp: number) {
  if ('minBreakpoint' in column && column.minBreakpoint && bp < breakpointOrder[column.minBreakpoint]) return false;
  if ('maxBreakpoint' in column && column.maxBreakpoint && bp > breakpointOrder[column.maxBreakpoint]) return false;
  return true;
}

/**
 * How a list looks: sort, the columns this width shows, export, and rows an app adds. One dropdowner menu, so a popup
 * from `sm` up and a drawer below; without anything to show it renders nothing.
 */
export function ViewMenu<TRow extends object>({ sort, columns, setColumns, export: exportOptions, className, children }: ViewMenuProps<TRow>) {
  const { t } = useTranslation();
  const isOnline = useOnlineManager();
  const breakpoint = useCurrentBreakpoint();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = `view-menu-${useId()}`;

  // Columns without a text name (checkbox, ellipsis) have nothing to list
  const toggleable = (columns ?? []).filter(
    (column) => typeof column.name === 'string' && column.name && isShownAt(column, breakpointOrder[breakpoint]),
  );
  const columnsShown = setColumns && toggleable.length > 1;
  const hasHidden = columnsShown && toggleable.some((column) => column.hidden);

  const download = (format: ExportFormat, rows: TRow[]) => {
    if (!columns || !exportOptions) return;
    const file = `${exportOptions.filename}.${format}`;
    if (format === 'csv') return exportToCsv(columns, rows, file);
    return exportToPdf(columns, rows, file, getRouter().state.location.pathname, uiStore.getState().mode);
  };
  const downloadAll = async (format: ExportFormat) => {
    if (exportOptions) download(format, await fetchAllRows(exportOptions.fetchRows));
  };

  // Only online menus offer the full export and the PDF, so neither handler checks the connection
  const selectedRows = exportOptions?.selectedRows ?? [];
  const exportRows = [
    ...(isOnline
      ? (['csv', 'pdf'] as const).map((format) => ({ format, note: t('c:all_rows').toLowerCase(), onSelect: () => downloadAll(format) }))
      : []),
    ...(selectedRows.length ? (isOnline ? (['csv', 'pdf'] as const) : (['csv'] as const)) : []).map((format) => ({
      format,
      note: t('c:resource_count', { count: selectedRows.length, resource: t('c:selected') }),
      onSelect: () => download(format, selectedRows),
    })),
  ];

  const sections: [string, ReactNode][] = [];
  if (sort) {
    sections.push([
      'sort',
      <DropdownActionGroup key="sort" label={t('c:sort')}>
        {sort.options.map((option) => (
          <DropdownSelectItem
            key={option.value}
            icon={option.icon}
            selected={option.value === sort.value}
            onSelect={() => sort.onChange(option.value)}
          >
            {t(option.name)}
          </DropdownSelectItem>
        ))}
      </DropdownActionGroup>,
    ]);
  }
  if (columnsShown) {
    sections.push([
      'columns',
      <DropdownActionGroup key="columns" label={t('c:columns')}>
        {toggleable.map((column) => (
          <DropdownToggleItem
            key={column.key}
            checked={!column.hidden}
            onCheckedChange={() => setColumns((prev) => prev.map((item) => (item.key === column.key ? { ...item, hidden: !item.hidden } : item)))}
          >
            {column.name}
          </DropdownToggleItem>
        ))}
      </DropdownActionGroup>,
    ]);
  }
  if (columns && exportOptions && exportRows.length > 0) {
    sections.push([
      'export',
      <DropdownActionGroup key="export" label={t('c:export')}>
        {exportRows.map(({ format, note, onSelect }) => (
          <DropdownActionItem key={`${format}-${note}`} icon={DownloadIcon} onSelect={onSelect}>
            <span>{format.toUpperCase()}</span>
            <span className="text-muted-foreground text-xs">{note}</span>
          </DropdownActionItem>
        ))}
      </DropdownActionGroup>,
    ]);
  }
  if (children) sections.push(['app', children]);

  const content = sections.map(([key, section], index) => (
    <Fragment key={key}>
      {index > 0 && <DropdownActionSeparator />}
      {section}
    </Fragment>
  ));

  // The dropdowner holds what it was opened with: refresh it while open, so a toggled column shows its new state
  useEffect(() => {
    if (dropdowner.getState().get()?.id === id) dropdowner.getState().update({ content });
  });

  if (!sections.length) return null;

  const open = () => dropdowner.getState().create(content, { id, triggerId: id, triggerRef, align: 'end', kind: 'menu', popupClassName: 'min-w-56' });

  return (
    <TooltipButton className={className} toolTipContent={t('c:view')}>
      <Button ref={triggerRef} variant="outline" className="relative flex data-dropdowner-active:bg-accent" onClick={open}>
        {hasHidden && <Badge className="absolute -top-1 -right-1 z-10 size-2 p-0" />}
        <SlidersHorizontalIcon />
        <span className="max-xl:sr-only">{t('c:view')}</span>
        {hasHidden && <span className="sr-only">{t('c:columns_hidden')}</span>}
      </Button>
    </TooltipButton>
  );
}
