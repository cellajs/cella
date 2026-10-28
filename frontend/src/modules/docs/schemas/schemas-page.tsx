import { useSuspenseQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { GenComponentSchema, GenSchemaTagSummary } from 'sdk/docs-types';
import { scrollToSectionById } from '~/hooks/scroll-spy-store';
import { usePrerenderTrigger } from '~/hooks/use-prerender';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { DocsPageHeader } from '~/modules/docs/docs-page-header';
import { schemasByTagQueryOptions, schemasQueryOptions, schemaTagsQueryOptions } from '~/modules/docs/query';
import { TagSchemasList } from '~/modules/docs/schemas/schema-detail';
import { TagSchemasTable } from '~/modules/docs/schemas/tag-schemas-table';
import { TagExpandLink } from '~/modules/docs/tag-expand-link';
import { TagSectionCard } from '~/modules/docs/tag-section-card';
import { collectTagKinds } from '~/modules/docs/tag-table';

/** All component schemas from the OpenAPI spec, categorized into base, data, and errors tags. */
export function SchemasPage() {
  const { t } = useTranslation();
  const { schemaTag: activeSchemaTag } = useSearch({ from: '/_public/_content/docs/schemas' });

  const { prerender } = usePrerenderTrigger('schemas');

  const { data: allSchemas } = useSuspenseQuery(schemasQueryOptions);
  const { data: schemasByTag } = useSuspenseQuery(schemasByTagQueryOptions);
  const { data: schemaTags } = useSuspenseQuery(schemaTagsQueryOptions);

  const tagKinds = collectTagKinds(allSchemas, ['schema']);

  const schemaCount = schemaTags.reduce((sum, tag) => sum + tag.count, 0);

  // Tag names only: a mounted TagSchemasList registers its schema anchors
  const tagSectionIds = schemaTags.map((tag) => `tag/${tag.name}`);

  useScrollSpy(tagSectionIds);

  return (
    <div className="container">
      <DocsPageHeader title={t('c:schema', { count: 2 })} />

      <p className="py-5 text-muted-foreground text-sm">
        {t('c:resource_count', { count: schemaCount, resource: t('c:schema', { count: schemaCount }) })}
      </p>

      <div className="flex flex-col gap-12 lg:gap-20">
        {schemaTags.map((tag) => (
          <SchemaTagSection
            key={tag.name}
            tag={tag}
            schemas={schemasByTag[tag.name] ?? []}
            tagKinds={tagKinds}
            isOpen={activeSchemaTag === tag.name}
            onPrerender={() => prerender(tag.name)}
          />
        ))}
      </div>
    </div>
  );
}

interface SchemaTagSectionProps {
  tag: GenSchemaTagSummary;
  schemas: GenComponentSchema[];
  tagKinds: string[];
  isOpen: boolean;
  onPrerender: () => void;
}

function SchemaTagSection({ tag, schemas, tagKinds, isOpen, onPrerender }: SchemaTagSectionProps) {
  return (
    <TagSectionCard
      scope="schemas"
      name={tag.name}
      sectionId={`tag/${tag.name}`}
      description={tag.description}
      isOpen={isOpen}
      details={<TagSchemasList schemas={schemas} />}
    >
      <TagSchemasTable schemas={schemas} tagName={tag.name} tagKinds={tagKinds} onPrerender={onPrerender} />
      <TagExpandLink
        isOpen={isOpen}
        to="."
        search={(prev) => ({ ...prev, schemaTag: isOpen ? undefined : tag.name })}
        hash={isOpen ? undefined : `tag/${tag.name}`}
        tagName={tag.name}
        onMouseEnter={onPrerender}
        onClick={() => {
          if (!isOpen) scrollToSectionById(`tag/${tag.name}`);
        }}
      />
    </TagSectionCard>
  );
}
