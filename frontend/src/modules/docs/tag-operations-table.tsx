import type { GenOperationSummary } from 'sdk/docs-types';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { MethodLabel } from '~/modules/docs/operations/method-label';
import { TagHashLink, TagTable } from '~/modules/docs/tag-table';

interface TagOperationsTableProps {
  operations: GenOperationSummary[];
  tagName: string;
  onPrerender?: () => void;
}

function operationColumns(tagName: string): ColumnOrColumnGroup<GenOperationSummary>[] {
  return [
    {
      key: 'method',
      name: '',
      width: 64,
      renderCell: ({ row }) => <MethodLabel method={row.method} />,
    },
    {
      key: 'path',
      name: '',
      minWidth: 200,
      renderCell: ({ row, tabIndex }) => (
        <TagHashLink tagParam="operationTag" tagName={tagName} hash={row.hash} tabIndex={tabIndex} title={row.path} dir="rtl">
          &lrm;{row.path}
        </TagHashLink>
      ),
    },
    {
      key: 'id',
      name: '',
      minBreakpoint: 'md',
      width: 200,
      renderCell: ({ row }) => <code className="truncate text-muted-foreground text-xs">{row.id}</code>,
    },
  ];
}

export function TagOperationsTable({ operations, tagName, onPrerender }: TagOperationsTableProps) {
  const columns = operationColumns(tagName);

  return <TagTable<GenOperationSummary> rows={operations} columns={columns} rowKeyGetter={(row) => row.hash} hideHeader onPrerender={onPrerender} />;
}
