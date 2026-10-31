import { useTranslation } from 'react-i18next';
import type { GenComponentSchema } from 'sdk/docs-types';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { schemaAnchor } from '~/modules/docs/helpers/schema-anchor';
import { upperFirst } from '~/modules/docs/helpers/upper-first';
import { TagBadges, TagHashLink, TagTable } from '~/modules/docs/tag-table';

interface TagSchemasTableProps {
  schemas: GenComponentSchema[];
  /** Schema-kind tag name for setting the `schemaTag` search param on row click. */
  tagName: string;
  /** Tag kinds (e.g., 'module', 'owner') to render as dynamic columns. */
  tagKinds: string[];
  onPrerender?: () => void;
}

function useColumns(tagName: string, tagKinds: string[]): ColumnOrColumnGroup<GenComponentSchema>[] {
  const { t } = useTranslation();

  const tagKindColumns: ColumnOrColumnGroup<GenComponentSchema>[] = tagKinds.map((kind) => ({
    key: `tag-${kind}`,
    name: upperFirst(kind),
    minBreakpoint: 'md',
    width: 140,
    placeholderValue: '-',
    renderCell: ({ row }) => {
      const values = row.tagsByKind[kind];
      return values?.length ? <TagBadges kind={kind} values={values} /> : null;
    },
  }));

  return [
    {
      key: 'name',
      name: t('c:name'),
      minWidth: 200,
      renderCell: ({ row, tabIndex }) => (
        <TagHashLink tagParam="schemaTag" tagName={tagName} hash={schemaAnchor(row)} tabIndex={tabIndex}>
          {row.name}
        </TagHashLink>
      ),
    },
    ...tagKindColumns,
  ];
}

export function TagSchemasTable({ schemas, tagName, tagKinds, onPrerender }: TagSchemasTableProps) {
  const columns = useColumns(tagName, tagKinds);

  return <TagTable<GenComponentSchema> rows={schemas} columns={columns} rowKeyGetter={(row) => row.name} onPrerender={onPrerender} />;
}
