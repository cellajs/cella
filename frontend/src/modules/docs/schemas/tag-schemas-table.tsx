import type { GenComponentSchema } from 'sdk/docs-types';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { TagHashLink, TagTable } from '~/modules/docs/tag-table';
import { Badge } from '~/modules/ui/badge';

interface TagSchemasTableProps {
  schemas: GenComponentSchema[];
  /** Schema-kind tag name for setting the `schemaTag` search param on row click. */
  tagName: string;
  /** Tag kinds (e.g., 'module', 'ownership') to render as dynamic columns. */
  tagKinds: string[];
  /** Called on hover/focus to trigger prerendering of this tag's expanded details. */
  onPrerender?: () => void;
}

function useColumns(tagName: string, tagKinds: string[]): ColumnOrColumnGroup<GenComponentSchema>[] {
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
      renderCell: ({ row, tabIndex }) => (
        <TagHashLink tagParam="schemaTag" tagName={tagName} hash={row.ref.replace(/^#/, '')} tabIndex={tabIndex}>
          {row.name}
        </TagHashLink>
      ),
    },
    ...tagKindColumns,
  ];
}

export function TagSchemasTable({ schemas, tagName, tagKinds, onPrerender }: TagSchemasTableProps) {
  const columns = useColumns(tagName, tagKinds);

  return (
    <TagTable<GenComponentSchema>
      rows={schemas}
      columns={columns}
      rowKeyGetter={(row) => row.name}
      onPrerender={onPrerender}
    />
  );
}
