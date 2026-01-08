import { Link, useSearch } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { Suspense } from 'react';
import { type OperationSummary, operations, type TagName, tags } from '~/api.gen/docs';
import { DescriptionEditor } from '~/modules/docs/description-editor';
import {
  OperationResponses,
  TagExpandButtonContent,
  TagExpandButtonLoading,
  tagDetailsQueryOptions,
} from '~/modules/docs/operation-responses';
import { Badge } from '~/modules/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { Collapsible, CollapsibleContent } from '~/modules/ui/collapsible';
import { queryClient } from '~/query/query-client';
import { cn } from '~/utils/cn';
import { buttonVariants } from '../ui/button';
import { getMethodColor } from './helpers/get-method-color';

const OperationsList = () => {
  // Get active tag from URL search param
  const { tag: activeTag } = useSearch({ from: '/publicLayout/docs/' });

  const operationsByTag = operations.reduce(
    (acc, operation) => {
      for (const tag of operation.tags) {
        if (!acc[tag]) {
          acc[tag] = [];
        }
        acc[tag].push(operation);
      }
      return acc;
    },
    {} as Record<string, OperationSummary[]>,
  );

  return (
    <>
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">API operations</h1>
        <p className="text-muted-foreground">
          {operations.length} operations across {tags.length} tags
        </p>
      </header>

      <div className="flex flex-col gap-12 lg:gap-20">
        {tags.map((tag) => {
          const tagOperations = operationsByTag[tag.name] || [];
          const isOpen = activeTag === tag.name;
          const endpointLabel = tag.count === 1 ? 'endpoint' : 'endpoints';

          return (
            <Collapsible key={tag.name} open={isOpen}>
              <Card id={`tag/${tag.name}`} className="scroll-mt-8 border-0 border-l-3 rounded-none">
                <CardHeader>
                  <CardTitle className="text-3xl leading-12">{tag.name}</CardTitle>
                  {tag.description && <CardDescription className="mt-2">{tag.description}</CardDescription>}
                </CardHeader>
                <CardContent className="flex items-center gap-4">
                  <Link
                    to="."
                    search={(prev) => ({ ...prev, tag: isOpen ? undefined : (tag.name as TagName) })}
                    replace
                    draggable={false}
                    resetScroll={false}
                    className={cn(buttonVariants({ variant: 'plain', size: 'lg' }), 'rounded-full')}
                    onMouseEnter={() => queryClient.prefetchQuery(tagDetailsQueryOptions(tag.name))}
                  >
                    {isOpen ? (
                      <Suspense fallback={<TagExpandButtonLoading count={tag.count} />}>
                        <TagExpandButtonContent tagName={tag.name} count={tag.count} isOpen={isOpen} />
                      </Suspense>
                    ) : (
                      <>
                        {tag.count} {endpointLabel}
                        <ChevronDown className="ml-2 h-4 w-4 transition-transform duration-200 opacity-50" />
                      </>
                    )}
                  </Link>
                </CardContent>

                <CollapsibleContent>
                  <Suspense>
                    <div className="border-t">
                      {tagOperations.map((operation) => (
                        <div
                          key={operation.hash}
                          id={operation.hash}
                          className="p-6 border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                        >
                          {operation.summary && <p className="text-xl mb-4">{operation.summary}</p>}

                          <div className="flex items-center gap-3 mb-4">
                            <Badge
                              className={`font-mono uppercase ${getMethodColor(operation.method)} bg-transparent shadow-none text-md rounded-none p-0`}
                            >
                              {operation.method.toUpperCase()}
                            </Badge>
                            <code className="text-lg opacity-70 font-mono">{operation.path}</code>
                            {operation.deprecated && (
                              <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                                Deprecated
                              </Badge>
                            )}
                          </div>

                          {operation.description && (
                            <div className="mb-4">
                              <DescriptionEditor
                                operationId={operation.id}
                                initialDescription={operation.description}
                              />
                            </div>
                          )}

                          {(operation.hasAuth || operation.hasParams || operation.hasRequestBody) && (
                            <div className="flex gap-4 text-sm">
                              {operation.hasAuth && <span className="text-muted-foreground">🔒 Auth required</span>}
                              {operation.hasParams && <span className="text-muted-foreground">📝 Parameters</span>}
                              {operation.hasRequestBody && (
                                <span className="text-muted-foreground">📤 Request body</span>
                              )}
                            </div>
                          )}

                          <div className="mt-4">
                            <h4 className="text-sm font-medium mb-2">Responses</h4>
                            <OperationResponses operationId={operation.id} tagName={operation.tags[0]} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </Suspense>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>
    </>
  );
};

export default OperationsList;
