import i18n from 'i18next';
import { BirdIcon } from 'lucide-react';
import { type RefObject, Suspense, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import Spinner from '~/modules/common/spinner';
import { OperationDetail } from '~/modules/docs/operations/operation-detail';
import { OperationExamples } from '~/modules/docs/operations/operation-examples';
import type { GenExtensionDefinition, GenOperationSummary } from '~/modules/docs/types';
import { Badge } from '~/modules/ui/badge';
import { Input } from '~/modules/ui/input';
import { getMethodColor } from '../../helpers/get-method-color';

/**
 * Opens a sheet with operation detail view
 */
function openOperationSheet(operation: GenOperationSummary, buttonRef: RefObject<HTMLButtonElement | null>) {
  useSheeter.getState().create(
    <Suspense fallback={<Spinner className="mt-[40vh]" />}>
      <div className="container pb-[50vh] pt-3">
        <OperationDetail operation={operation} />
      </div>
    </Suspense>,
    {
      id: `operation-${operation.id}`,
      triggerRef: buttonRef,
      side: 'right',
      className: 'max-w-full lg:max-w-4xl',
      title: i18n.t('common:docs.operation_detail'),
    },
  );
}

/**
 * Opens a sheet with operation examples view (ViewerGroup with example preselected)
 */
function openExamplesSheet(operation: GenOperationSummary, buttonRef: RefObject<HTMLButtonElement | null>) {
  useSheeter.getState().create(
    <Suspense fallback={<Spinner className="mt-[40vh]" />}>
      <div className="container pb-[50vh] pt-3">
        <OperationExamples operationId={operation.id} tagName={operation.tags[0]} />
      </div>
    </Suspense>,
    {
      id: `examples-${operation.id}`,
      triggerRef: buttonRef,
      side: 'right',
      className: 'max-w-full lg:max-w-4xl',
      title: i18n.t('common:docs.success_response'),
    },
  );
}

/**
 * Cell component for clickable operation path that opens detail sheet
 */
function PathCell({ row }: { row: GenOperationSummary }) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={buttonRef}
      type="button"
      className="font-mono text-xs truncate hover:underline underline-offset-3 decoration-foreground/30 text-left w-full"
      onClick={() => openOperationSheet(row, buttonRef)}
    >
      {row.path}
    </button>
  );
}

/**
 * Cell component for clickable example icon that opens examples sheet.
 */
function ExampleCell({ row }: { row: GenOperationSummary }) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  // No response body means examples are not applicable
  if (!row.hasResponseBody) return <div className="w-full text-center text-muted-foreground/50">na</div>;

  // Has response body but no example yet
  if (!row.hasExample) return <div className="w-full text-center text-muted-foreground">-</div>;

  return (
    <button
      ref={buttonRef}
      type="button"
      className="flex items-center w-full justify-center opacity-60 hover:opacity-100"
      onClick={() => openExamplesSheet(row, buttonRef)}
    >
      <BirdIcon className="h-4 w-4" />
    </button>
  );
}

export const useColumns = (_isCompact: boolean, extensions: GenExtensionDefinition[] = []) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm', false);

  const columns = useMemo(() => {
    // Generate extension columns dynamically from extension definitions
    const extensionColumns: ColumnOrColumnGroup<GenOperationSummary>[] = extensions.map((ext) => ({
      key: ext.id,
      name: t(ext.translationKey),
      visible: !isMobile,
      sortable: false,
      resizable: true,
      width: 150,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }: { row: GenOperationSummary }) => {
        const values = row.extensions[ext.id];
        return values?.length ? (
          <div className="font-mono text-[11px] flex flex-wrap gap-1 truncate">
            {values.map((value: string) => (
              <code key={value} className="truncate inline-block">
                {value}
              </code>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    }));

    const cols: ColumnOrColumnGroup<GenOperationSummary>[] = [
      {
        key: 'method',
        name: t('common:method'),
        visible: true,
        resizable: false,
        width: 80,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (
          <Badge
            variant="secondary"
            className={`font-mono uppercase text-xs bg-transparent shadow-none ${getMethodColor(row.method)}`}
          >
            {row.method.toUpperCase()}
          </Badge>
        ),
      },
      {
        key: 'path',
        name: t('common:path'),
        minWidth: 180,
        visible: true,
        resizable: true,
        sortable: false,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => <PathCell row={row} />,
      },
      {
        key: 'hasExample',
        name: '',
        visible: true,
        resizable: false,
        sortable: false,
        width: 50,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => <ExampleCell row={row} />,
      },
      {
        key: 'id',
        name: t('common:docs.operation_id'),
        sortable: true,
        visible: true,
        resizable: true,
        width: 200,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (
          <code className="font-mono text-[11px] text-muted-foreground/80 truncate">{row.id}</code>
        ),
      },
      {
        key: 'summary',
        name: t('common:summary'),
        visible: false,
        sortable: true,
        resizable: true,
        editable: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => <span className="truncate text-sm">{row.summary || row.id}</span>,
        renderEditCell: ({ row, onRowChange }) => (
          <Input value={row.summary} onChange={(e) => onRowChange({ ...row, summary: e.target.value })} autoFocus />
        ),
      },
      // Insert dynamically generated extension columns
      ...extensionColumns,
      {
        key: 'tags',
        name: t('common:tags'),
        sortable: false,
        visible: !isMobile,
        resizable: true,
        minWidth: 80,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) =>
          row.tags?.length ? (
            <div className="flex flex-wrap gap-1">
              {row.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
    ];

    return cols;
  }, [t, extensions, isMobile]);

  return useState<ColumnOrColumnGroup<GenOperationSummary>[]>(columns);
};
