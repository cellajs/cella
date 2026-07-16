import { useSuspenseQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePrerenderSection, usePrerenderTrigger } from '~/hooks/use-prerender';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { HashUrlButton } from '~/modules/common/hash-url-button';
import { DocsPageHeader } from '~/modules/docs/docs-page-header';
import { schemasByTagQueryOptions, schemasQueryOptions, schemaTagsQueryOptions } from '~/modules/docs/query';
import { TagSchemasList } from '~/modules/docs/schemas/schema-detail';
import { TagSchemasTable } from '~/modules/docs/schemas/tag-schemas-table';
import { TagExpandLink } from '~/modules/docs/tag-expand-link';
import type { GenComponentSchema, GenSchemaTagSummary } from '~/modules/docs/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { Collapsible, CollapsibleContent } from '~/modules/ui/collapsible';
import { cn } from '~/utils/cn';
import { getHashUrl } from '../hash-url';

/**
 * Schemas page displaying all component schemas from the OpenAPI spec.
 * Schemas are categorized into base, data, and errors tags.
 */
function SchemasPage() {
  const { t } = useTranslation();
  // Get active schema tag from URL search param (hash)
  const { schemaTag: activeSchemaTag } = useSearch({ from: '/_public/_content/docs/schemas' });

  // Prerender trigger for hover-intent DOM preparation
  const { prerender } = usePrerenderTrigger('schemas');

  // Fetch schemas grouped by tag, and schema tags list
  const { data: allSchemas } = useSuspenseQuery(schemasQueryOptions);
  const { data: schemasByTag } = useSuspenseQuery(schemasByTagQueryOptions);
  const { data: schemaTags } = useSuspenseQuery(schemaTagsQueryOptions);

  // Derive distinct non-schema tag kinds (e.g., 'module', 'ownership') for dynamic columns.
  // The `schema` kind is excluded because this section already implies it.
  const tagKinds = useMemo(() => {
    const kinds = new Set<string>();
    for (const s of allSchemas) {
      if (!s.tagsByKind) continue;
      for (const kind of Object.keys(s.tagsByKind)) {
        if (kind !== 'schema') kinds.add(kind);
      }
    }
    return Array.from(kinds);
  }, [allSchemas]);

  // Total schema count derived from schema tags
  const schemaCount = schemaTags.reduce((sum, t) => sum + t.count, 0);

  // Tag section IDs - schema refs are contributed by SchemaDetail when rendered
  const schemaTagIds = schemaTags.map((t) => t.name);

  // Enable scroll spy with tag section IDs
  useScrollSpy(schemaTagIds);

  return (
    <div className="container">
      <DocsPageHeader title={t('c:schema', { count: 2 })} />

      <div className="flex items-center gap-3 py-5">
        <span className="text-muted-foreground text-sm">
          {schemaCount} {t('c:schema', { count: schemaCount })}
        </span>
      </div>

      <div className="flex flex-col gap-12 lg:gap-20">
        {schemaTags.map((tag) => (
          <SchemaTagSection
            key={tag.name}
            tag={tag}
            schemas={schemasByTag[tag.name] || []}
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

/**
 * Single schema tag section with prerender-aware collapsible content.
 * Extracted as component so usePrerenderSection hook can be called per-tag.
 */
function SchemaTagSection({ tag, schemas: tagSchemas, tagKinds, isOpen, onPrerender }: SchemaTagSectionProps) {
  const { shouldMount, style } = usePrerenderSection('schemas', tag.name, isOpen);

  return (
    <Collapsible open={isOpen}>
      <Card id={`spy-${tag.name}`} className={cn('scroll-mt-4 border-0', isOpen && 'rounded-b-none')}>
        <CardHeader className="group">
          <CardTitle className="gap-2 text-2xl leading-12">
            {tag.name}
            <HashUrlButton url={getHashUrl(tag.name)} />
          </CardTitle>
          <CardDescription className="my-2 max-w-4xl text-base">{tag.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Schemas table */}
          <TagSchemasTable schemas={tagSchemas} tagName={tag.name} tagKinds={tagKinds} onPrerender={onPrerender} />

          {/* Show details button */}
          <TagExpandLink
            isOpen={isOpen}
            to="."
            search={(prev) => ({ ...prev, schemaTag: isOpen ? undefined : tag.name })}
            hash={isOpen ? undefined : tag.name}
            onMouseEnter={onPrerender}
            onClick={() => {
              if (!isOpen) scrollToSectionById(tag.name);
            }}
          />
        </CardContent>
      </Card>

      {/* Schema details list, prerendered with content-visibility: hidden on hover */}
      {shouldMount && (
        <CollapsibleContent keepMounted>
          <div style={style}>
            <Suspense>
              <TagSchemasList schemas={tagSchemas} />
            </Suspense>
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

export { SchemasPage };
