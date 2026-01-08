import { Link, useSearch } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import type { GenOperationSummary, GenTagSummary, TagName } from '~/api.gen/docs';
import { DescriptionEditor } from '~/modules/docs/description-editor';
import { Badge } from '~/modules/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { Collapsible, CollapsibleContent } from '~/modules/ui/collapsible';
import { cn } from '~/utils/cn';
import { buttonVariants } from '../ui/button';

interface DocsContentListProps {
  operations: GenOperationSummary[];
  tags: GenTagSummary[];
}

const getMethodColor = (method: string) => {
  switch (method.toLowerCase()) {
    case 'get':
      return 'bg-blue-500 text-white';
    case 'post':
      return 'bg-green-500 text-white';
    case 'put':
      return 'bg-orange-500 text-white';
    case 'delete':
      return 'bg-red-500 text-white';
    case 'patch':
      return 'bg-purple-500 text-white';
    default:
      return 'bg-gray-500 text-white';
  }
};

export function DocsContentList({ operations, tags }: DocsContentListProps) {
  // Get active tag from URL search param
  const { tag: activeTag } = useSearch({ from: '/publicLayout/docs' });

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
    {} as Record<string, GenOperationSummary[]>,
  );

  return (
    <div className="flex flex-col gap-12 lg:gap-20">
      {tags.map((tag) => {
        const tagOperations = operationsByTag[tag.name] || [];
        const isOpen = activeTag === tag.name;
        const operationLabel = tag.count === 1 ? 'operation' : 'operations';

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
                  resetScroll={false}
                  className={cn(buttonVariants({ variant: 'plain', size: 'lg' }), 'rounded-full')}
                >
                  {isOpen ? `${tag.count} ${operationLabel}` : `${tag.count} ${operationLabel}`}
                  <ChevronDown
                    className={cn('ml-2 h-4 w-4 transition-transform duration-200 opacity-50', isOpen && 'rotate-180')}
                  />
                </Link>
              </CardContent>

              <CollapsibleContent>
                <div className="border-t">
                  {tagOperations.map((operation) => (
                    <div
                      key={operation.hash}
                      id={operation.hash}
                      className="p-6 border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                    >
                      {operation.summary && <p className="text-xl mb-4">{operation.summary}</p>}

                      <div className="flex items-center gap-3 mb-4">
                        <Badge className={`font-mono uppercase ${getMethodColor(operation.method)}`}>
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
                          <DescriptionEditor operationId={operation.id} initialDescription={operation.description} />
                        </div>
                      )}

                      {(operation.hasAuth || operation.hasParams || operation.hasRequestBody) && (
                        <div className="flex gap-4 text-sm">
                          {operation.hasAuth && <span className="text-muted-foreground">🔒 Auth required</span>}
                          {operation.hasParams && <span className="text-muted-foreground">📝 Parameters</span>}
                          {operation.hasRequestBody && <span className="text-muted-foreground">📤 Request body</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
}
