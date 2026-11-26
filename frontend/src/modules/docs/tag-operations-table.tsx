import type { GenOperationSummary } from 'sdk/docs-types';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { HighlightText } from '~/modules/common/match-highlight/highlight-text';
import { MethodLabel } from '~/modules/docs/operations/method-label';
import { ShortPath } from '~/modules/docs/operations/short-path';
import { isSwitchedOff, StruckText, SwitchedOffBadge } from '~/modules/docs/operations/switched-off-badge';
import { TagHashLink, TagTable } from '~/modules/docs/tag-table';

interface TagOperationsTableProps {
  operations: GenOperationSummary[];
  tagName: string;
  onPrerender?: () => void;
}

const operationColumns = (tagName: string): ColumnOrColumnGroup<GenOperationSummary>[] => [
  {
    key: 'method',
    name: '',
    width: 64,
    renderCell: ({ row }) => <MethodLabel method={row.method} off={isSwitchedOff(row.enabledBy)} />,
  },
  {
    key: 'path',
    name: '',
    minWidth: 200,
    renderCell: ({ row, tabIndex }) => (
      <>
        <TagHashLink tagParam="operationTag" tagName={tagName} hash={row.hash} tabIndex={tabIndex} title={row.path} dir="rtl">
          <StruckText struck={isSwitchedOff(row.enabledBy)}>
            <ShortPath path={row.path} />
          </StruckText>
        </TagHashLink>
        <SwitchedOffBadge enabledBy={row.enabledBy} className="ml-2" />
      </>
    ),
  },
  {
    key: 'id',
    name: '',
    minBreakpoint: 'md',
    width: 200,
    renderCell: ({ row }) => (
      <code className="text-muted-foreground truncate text-xs">
        <HighlightText text={row.id} />
      </code>
    ),
  },
];

export function TagOperationsTable({ operations, tagName, onPrerender }: TagOperationsTableProps) {
  const columns = operationColumns(tagName);

  return <TagTable<GenOperationSummary> rows={operations} columns={columns} rowKeyGetter={(row) => row.hash} hideHeader onPrerender={onPrerender} />;
}
