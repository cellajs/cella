import { Link, useNavigate } from '@tanstack/react-router';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { DataTable } from '~/modules/common/data-table/data-table';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { GenComponentSchema } from '~/modules/docs/types';
import { Badge } from '~/modules/ui/badge';

interface TagSchemasTableProps {
  schemas: GenComponentSchema[];
  /** Schema-kind tag name (used to set the `schemaTag` search param on row click). */
  tagName: string;
  /** Tag kinds (e.g., 'module', 'ownership') to render as dynamic columns. */
  tagKinds: string[];
  /** Called on hover/focus to trigger prerendering of this tag's expanded details. */
  onPrerender?: () => void;
}

/**
 * Compact read-only table listing schemas within a single schema-kind tag section.
 * Mirrors the structure of `TagOperationsTable`: a name link + dynamic tag-kind columns.
 */
function useColumns(tagName: string, tagKinds: string[]): ColumnOrColumnGroup<GenComponentSchema>[] {
  const navigate = useNavigate();

  const handleSchemaClick = (hash: string) => {
    scrollToSectionById(hash);
    navigate({
      to: '.',
      search: (prev) => ({ ...prev, schemaTag: tagName }),
      hash,
      replace: true,
      resetScroll: false,
    });
  };

  const tagKindColumns: ColumnOrColumnGroup<GenComponentSchema>[] = tagKinds.map((kind) => ({
    key: `tag-${kind}`,
    name: kind.replace(/^\w/, (c) => c.toUpperCase()),
    minBreakpoint: 'md',
    width: 140,
    placeholderValue: '-',
    renderCell: ({ row }) => {
      const values = row.tagsByKind?.[kind];
      if (!values?.length) return null;
      return (
        <div className="flex flex-wrap gap-1">
          {values.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      );
    },
  }));

  return [
    {
      key: 'name',
      name: 'Name',
      minWidth: 200,
      renderCell: ({ row, tabIndex }) => {
        const schemaId = row.ref.replace(/^#/, '');
        return (
          <Link
            to="."
            search={(prev) => ({ ...prev, schemaTag: tagName })}
            hash={schemaId}
            replace
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              handleSchemaClick(schemaId);
            }}
            resetScroll={false}
            draggable={false}
            tabIndex={tabIndex}
            className="truncate font-mono text-sm decoration-foreground/30 underline-offset-3 hover:underline"
          >
            {row.name}
          </Link>
        );
      },
    },
    ...tagKindColumns,
  ];
}

/**
 * Read-only schemas table for a single schema-kind tag section.
 * Replaces the previous plain `<Link>` list with a sortable column layout.
 */
export const TagSchemasTable = ({ schemas, tagName, tagKinds, onPrerender }: TagSchemasTableProps) => {
  const columns = useColumns(tagName, tagKinds);

  return (
    <div onMouseEnter={onPrerender} onFocus={onPrerender}>
      <DataTable<GenComponentSchema>
        className="mb-0"
        columns={columns}
        rows={schemas}
        hasNextPage={false}
        rowKeyGetter={(row) => row.name}
        isLoading={false}
        isFetching={false}
        limit={schemas.length}
        isFiltered={false}
        rowHeight={36}
        enableVirtualization={false}
        readOnly
      />
    </div>
  );
};
