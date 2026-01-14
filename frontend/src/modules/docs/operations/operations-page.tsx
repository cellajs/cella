import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useSearch } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { HashUrlButton } from '~/modules/docs/hash-url-button';
import { TagOperationsList } from '~/modules/docs/operations/operation-detail';
import { TagExpandButtonContent, TagExpandButtonLoading } from '~/modules/docs/operations/operation-responses';
import { ViewModeToggle } from '~/modules/docs/operations/view-mode-toggle';
import { operationsQueryOptions, tagDetailsQueryOptions, tagsQueryOptions } from '~/modules/docs/query';
import { TagOperationsTable } from '~/modules/docs/tag-operations-table';
import type { GenOperationSummary } from '~/modules/docs/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { Collapsible, CollapsibleContent } from '~/modules/ui/collapsible';
import { queryClient } from '~/query/query-client';
import { cn } from '~/utils/cn';
import { buttonVariants } from '../../ui/button';

const OperationsPage = () => {
  const { t } = useTranslation();
  // Get active tag from URL search param
  const { operationTag: activeTag } = useSearch({ from: '/publicLayout/docs/operations' });

  // Fetch operations and tags via React Query (reduces bundle size)
  const { data: operations } = useSuspenseQuery(operationsQueryOptions);
  const { data: tags } = useSuspenseQuery(tagsQueryOptions);

  // Tag section IDs - operation hashes are contributed by OperationDetail when rendered
  const tagSectionIds = useMemo(() => tags.map((t) => `tag/${t.name}`), [tags]);

  // Enable scroll spy with tag section IDs, enable hash writing
  // subscribeToChanges: false - this page only registers sections, doesn't need to re-render on section changes
  useScrollSpy({
    sectionIds: tagSectionIds,
    enableWriteHash: true,
    smoothScroll: false,
    subscribeToChanges: false,
  });

  // Pre-group operations by tag to avoid recalculating on every render
  const operationsByTag = useMemo(
    () =>
      operations.reduce(
        (acc, operation) => {
          for (const tag of operation.tags) {
            if (!acc[tag]) {
              acc[tag] = [];
            }
            acc[tag].push(operation);
          }
          return acc;
        },
        {} as Record<string, GenOperationSummary[]>,
      ),
    [operations],
  );

  return (
    <div>
      <div className="container flex items-center gap-3 mb-6">
        <ViewModeToggle />

        <span className="text-sm text-muted-foreground lowercase">
          {operations.length} {t('common:operation', { count: operations.length })}
        </span>
      </div>

      <div className="container flex flex-col gap-12 lg:gap-20">
        {tags.map((tag) => {
          const tagOperations = operationsByTag[tag.name] || [];
          const isOpen = activeTag === tag.name;

          return (
            <Collapsible key={tag.name} open={isOpen}>
              <Card id={`tag/${tag.name}`} className="scroll-mt-16 sm:scroll-mt-6 border-0 rounded-b-none">
                <CardHeader className="group">
                  <CardTitle className="text-2xl leading-12 gap-2">
                    {tag.name}
                    <HashUrlButton id={`tag/${tag.name}`} />
                  </CardTitle>
                  {tag.description && (
                    <CardDescription className="my-2 text-base max-w-4xl">{tag.description}</CardDescription>
                  )}
                  <p className="text-sm font-medium mt-4">{t('common:operation', { count: tag.count })}</p>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 rdg-readonly">
                  {/* Readonly data table with operations in this tag */}
                  <TagOperationsTable operations={tagOperations} tagName={tag.name} />

                  {/* Show details button */}
                  <div className="flex w-full justify-center">
                    <Link
                      to="."
                      search={(prev) => ({ ...prev, operationTag: isOpen ? undefined : tag.name })}
                      replace
                      draggable={false}
                      resetScroll={false}
                      className={cn(
                        buttonVariants({ variant: isOpen ? 'outlineGhost' : 'plain', size: 'lg' }),
                        'rounded-full',
                      )}
                      onMouseEnter={() => queryClient.prefetchQuery(tagDetailsQueryOptions(tag.name))}
                    >
                      {isOpen ? (
                        <Suspense fallback={<TagExpandButtonLoading />}>
                          <TagExpandButtonContent tagName={tag.name} isOpen={isOpen} />
                        </Suspense>
                      ) : (
                        <>
                          {t('common:docs.show_details')}
                          <ChevronDown className="ml-2 h-4 w-4 transition-transform duration-200 opacity-50" />
                        </>
                      )}
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Operation details list */}
              <CollapsibleContent>
                <Suspense>
                  <TagOperationsList operations={tagOperations} />
                </Suspense>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
};

export default OperationsPage;
