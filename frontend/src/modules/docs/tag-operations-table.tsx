import type { GenOperationSummary } from 'sdk/docs-types';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { TagHashLink, TagTable } from '~/modules/docs/tag-table';
import { Badge } from '~/modules/ui/badge';
import { getMethodColor } from './helpers/get-method-color';

interface TagOperationsTableProps {
  operations: GenOperationSummary[];
  tagName: string;
  /** Called on hover/focus to trigger prerendering of this tag's details */
  onPrerender?: () => void;
}

function useColumns(tagName: string): ColumnOrColumnGroup<GenOperationSummary>[] {
  return [
    {
      key: 'method',
      name: '',

      width: 80,
      renderCell: ({ row }) => (
        <Badge variant="secondary" className={`bg-transparent font-mono text-xs uppercase shadow-none ${getMethodColor(row.method)}`}>
          {row.method.toUpperCase()}
        </Badge>
      ),
    },
    {
      key: 'path',
      name: '',
      minWidth: 200,

      renderCell: ({ row, tabIndex }) => (
        <TagHashLink tagParam="operationTag" tagName={tagName} hash={row.hash} tabIndex={tabIndex} title={row.path} dir="rtl" className="text-left">
          &lrm;{row.path}
        </TagHashLink>
      ),
    },
    {
      key: 'id',
      name: '',
      minBreakpoint: 'md',

      width: 200,
      renderCell: ({ row }) => <code className="truncate font-mono text-muted-foreground text-xs">{row.id}</code>,
    },
  ];
}

export function TagOperationsTable({ operations, tagName, onPrerender }: TagOperationsTableProps) {
  const columns = useColumns(tagName);

  return <TagTable<GenOperationSummary> rows={operations} columns={columns} rowKeyGetter={(row) => row.hash} hideHeader onPrerender={onPrerender} />;
}
