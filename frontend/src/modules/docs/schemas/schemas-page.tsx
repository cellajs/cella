import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useSearch } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { HashUrlButton } from '~/modules/docs/hash-url-button';
import { schemasQueryOptions, schemaTagsQueryOptions } from '~/modules/docs/query';
import { TagSchemasList } from '~/modules/docs/schemas/schema-detail';
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

  // Fetch schemas and schema tags via React Query (reduces bundle size)
  const { data: schemas } = useSuspenseQuery(schemasQueryOptions);
  const { data: schemaTags } = useSuspenseQuery(schemaTagsQueryOptions);

  // Tag section IDs - schema refs are contributed by SchemaDetail when rendered
  const schemaTagIds = schemaTags.map((t) => t.name);

  // Enable scroll spy with tag section IDs
  useScrollSpy(schemaTagIds);

  return (
    <div className="container">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-sm text-muted-foreground">
          {schemas.length} {t('common:schema', { count: schemas.length })}
        </span>
      </div>

      <div className="flex flex-col gap-12 lg:gap-20">
        {schemaTags.map((tag) => {
          const tagSchemas = schemas.filter((s) => s.schemaTag === tag.name);
          const isOpen = activeSchemaTag === tag.name;

          return (
            <Collapsible key={tag.name} open={isOpen}>
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
                    {tagSchemas.map((schema) => (
                      <Link
                        key={schema.name}
                        to="."
                        search={(prev) => ({ ...prev, schemaTag: tag.name })}
                        hash={schema.ref.replace(/^#/, '')}
                        replace
                        draggable={false}
                        className="flex max-w-full min-w-0 items-baseline gap-0.5 font-mono text-sm truncate"
                      >
                        <span className="min-w-0 flex-[0_1_auto] truncate">
                          {schema.ref.split('/').slice(0, -1).join('/')}
                        </span>
                        <span className="shrink-0 font-semibold">/{schema.ref.split('/').pop()}</span>
                      </Link>
                    ))}
                  </div>

                  {/* Show details button */}
                  <Link
                    to="."
                    search={(prev) => ({ ...prev, schemaTag: isOpen ? undefined : tag.name })}
                    hash={isOpen ? undefined : tag.name}
                    replace
                    draggable={false}
                    resetScroll={false}
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'default' }),
                      'flex items-center w-fit gap-2 -ml-3',
                    )}
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

              {/* Schema details list - outside Card so Card height is reasonable for scroll spy */}
              <CollapsibleContent>
                <Suspense>
                  <TagSchemasList schemas={tagSchemas} />
                </Suspense>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}

export default SchemasPage;
