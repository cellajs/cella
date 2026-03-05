import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { usePrerenderSection, usePrerenderTrigger } from '~/hooks/use-prerender';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { StickyBox } from '~/modules/common/sticky-box';
import { HashUrlButton } from '~/modules/docs/hash-url-button';
import { schemasByTagQueryOptions, schemaTagsQueryOptions } from '~/modules/docs/query';
import { TagSchemasList } from '~/modules/docs/schemas/schema-detail';
import type { GenComponentSchema, GenSchemaTagSummary } from '~/modules/docs/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { Collapsible, CollapsibleContent } from '~/modules/ui/collapsible';
import { cn } from '~/utils/cn';
import { buttonVariants } from '../../ui/button';

/**
 * Schemas page displaying all component schemas from the OpenAPI spec.
 * Schemas are categorized into base, data, and errors tags.
 */
function SchemasPage() {
  const { t } = useTranslation();
  // Get active schema tag from URL search param (hash)
  const { schemaTag: activeSchemaTag } = useSearch({ from: '/publicLayout/docs/schemas' });

  // Prerender trigger for hover-intent DOM preparation
  const { prerender } = usePrerenderTrigger('schemas');

  // Fetch schemas grouped by tag, and schema tags list
  const { data: schemasByTag } = useSuspenseQuery(schemasByTagQueryOptions);
  const { data: schemaTags } = useSuspenseQuery(schemaTagsQueryOptions);

  // Total schema count derived from schema tags
  const schemaCount = schemaTags.reduce((sum, t) => sum + t.count, 0);

  // Tag section IDs - schema refs are contributed by SchemaDetail when rendered
  const schemaTagIds = schemaTags.map((t) => t.name);

  // Enable scroll spy with tag section IDs
  useScrollSpy(schemaTagIds);

  return (
    <div className="container">
      <StickyBox className="z-10 bg-background/60 backdrop-blur-xs" hideWhenOutOfView>
        <div className="flex items-center gap-3 py-4">
          <span className="text-sm text-muted-foreground">
            {schemaCount} {t('common:schema', { count: schemaCount })}
          </span>
        </div>
      </StickyBox>

      <div className="flex flex-col gap-12 lg:gap-20">
        {schemaTags.map((tag) => (
          <SchemaTagSection
            key={tag.name}
            tag={tag}
            schemas={schemasByTag[tag.name] || []}
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
  isOpen: boolean;
  onPrerender: () => void;
}

/**
 * Single schema tag section with prerender-aware collapsible content.
 * Extracted as component so usePrerenderSection hook can be called per-tag.
 */
function SchemaTagSection({ tag, schemas: tagSchemas, isOpen, onPrerender }: SchemaTagSectionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { scrollToSection } = useScrollSpy();
  const { shouldMount, style } = usePrerenderSection('schemas', tag.name, isOpen);

  return (
    <Collapsible open={isOpen}>
      <Card id={`spy-${tag.name}`} className="scroll-mt-4 border-0 rounded-b-none">
        <CardHeader className="group">
          <CardTitle className="text-2xl leading-12 gap-2">
            {tag.name}
            <HashUrlButton id={tag.name} />
          </CardTitle>
          <CardDescription className="my-2 text-base max-w-4xl">{tag.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Schema refs list */}
          <div className="flex flex-col gap-1">
            {tagSchemas.map((schema) => {
              const schemaId = schema.ref.replace(/^#/, '');
              return (
                <Link
                  key={schema.name}
                  to="."
                  search={(prev) => ({ ...prev, schemaTag: tag.name })}
                  hash={schemaId}
                  replace
                  draggable={false}
                  resetScroll={false}
                  className="flex max-w-full min-w-0 items-baseline gap-0.5 font-mono text-sm truncate"
                  onMouseEnter={onPrerender}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey) return;
                    e.preventDefault();
                    navigate({
                      to: '.',
                      search: (prev) => ({ ...prev, schemaTag: tag.name }),
                      hash: schemaId,
                      replace: true,
                      resetScroll: false,
                    }).finally(() => {
                      scrollToSection(schemaId);
                    });
                  }}
                >
                  <span className="min-w-0 flex-[0_1_auto] truncate">
                    {schema.ref.split('/').slice(0, -1).join('/')}
                  </span>
                  <span className="shrink-0 font-semibold">/{schema.ref.split('/').pop()}</span>
                </Link>
              );
            })}
          </div>

          {/* Show details button */}
          <Link
            to="."
            search={(prev) => ({ ...prev, schemaTag: isOpen ? undefined : tag.name })}
            hash={isOpen ? undefined : tag.name}
            replace
            draggable={false}
            resetScroll={false}
            onMouseEnter={onPrerender}
            onClick={() => {
              if (!isOpen) scrollToSectionById(tag.name);
            }}
            className={cn(buttonVariants({ variant: 'ghost', size: 'default' }), 'flex items-center w-fit gap-2 -ml-3')}
          >
            <h4 className="text-sm font-medium">{t('common:schema', { count: 2 })}</h4>
            <ChevronDownIcon
              className={cn(
                'size-4 transition-transform duration-200 opacity-40 group-hover:opacity-70',
                isOpen && 'rotate-180',
              )}
            />
          </Link>
        </CardContent>
      </Card>

      {/* Schema details list — prerendered with content-visibility: hidden on hover */}
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

export default SchemasPage;
