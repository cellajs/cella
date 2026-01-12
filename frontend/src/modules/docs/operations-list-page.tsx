import { Link, useSearch } from '@tanstack/react-router';
import { ChevronDown, ChevronDownIcon } from 'lucide-react';
import { Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type GenOperationSummary, operations, type TagName, tags } from '~/api.gen/docs';
import { DescriptionEditor } from '~/modules/docs/description-editor';
import { OperationRequest } from '~/modules/docs/operation-request';
import {
  OperationResponses,
  TagExpandButtonContent,
  TagExpandButtonLoading,
  tagDetailsQueryOptions,
} from '~/modules/docs/operation-responses';
import { TagOperationsTable } from '~/modules/docs/tag-operations-table';
import { Badge } from '~/modules/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import { queryClient } from '~/query/query-client';
import { cn } from '~/utils/cn';
import { SimpleHeader } from '../common/simple-header';
import { buttonVariants } from '../ui/button';
import { getMethodColor } from './helpers/get-method-color';

interface OperationDetailProps {
  operation: GenOperationSummary;
}

/**
 * Single operation detail with collapsible request and responses sections
 */
const OperationDetail = ({ operation }: OperationDetailProps) => {
  const { t } = useTranslation();
  const [isRequestOpen, setIsRequestOpen] = useState(true);
  const [isResponsesOpen, setIsResponsesOpen] = useState(true);

  return (
    <div
      key={operation.hash}
      id={operation.hash}
      className="p-6 mt-4 scroll-mt-12 sm:scroll-mt-4 border-b last:border-b-0 transition-colors"
    >
      <div className="flex justify-between items-start mb-4">
        {operation.summary && <p className="text-xl font-medium">{operation.summary}</p>}
        <div className="max-sm:hidden text-sm font-mono px-2 py-0.5 text-muted-foreground shrink-0">{operation.id}</div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <Badge
          className={`font-mono uppercase ${getMethodColor(operation.method)} bg-transparent shadow-none text-md rounded-none p-0`}
        >
          {operation.method.toUpperCase()}
        </Badge>
        <code className="sm:text-lg opacity-70 font-mono break-all">{operation.path}</code>
        {operation.deprecated && (
          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
            {t('common:deprecated')}
          </Badge>
        )}
      </div>

      {operation.description && (
        <div className="pt-3 pb-3">
          <DescriptionEditor operationId={operation.id} initialDescription={operation.description} />
        </div>
      )}

      {/* Request (path params, query params, body) */}
      <OperationRequest
        operationId={operation.id}
        tagName={operation.tags[0]}
        isOpen={isRequestOpen}
        onOpenChange={setIsRequestOpen}
      />

      {/* Responses */}
      <Collapsible open={isResponsesOpen} onOpenChange={setIsResponsesOpen} className="mt-8">
        <CollapsibleTrigger className="flex items-center gap-2 group w-full text-left">
          <h4 className="text-sm font-medium">{t('common:docs.responses')}</h4>
          <ChevronDownIcon
            className={cn(
              'size-4 transition-transform duration-200 opacity-40 group-hover:opacity-70',
              isResponsesOpen && 'rotate-180',
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
          <div className="mt-2">
            <OperationResponses
              operationId={operation.id}
              tagName={operation.tags[0]}
              onResponseOpen={() => setIsRequestOpen(false)}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

const OperationsListPage = () => {
  const { t } = useTranslation();
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
    {} as Record<string, GenOperationSummary[]>,
  );

  return (
    <>
      <SimpleHeader className="mb-8" heading={t('common:docs.api_operations')} />

      <div className="flex flex-col gap-12 lg:gap-20">
        {tags.map((tag) => {
          const tagOperations = operationsByTag[tag.name] || [];
          const isOpen = activeTag === tag.name;

          return (
            <Collapsible key={tag.name} open={isOpen}>
              <Card id={`tag/${tag.name}`} className="scroll-mt-16 sm:scroll-mt-6 border-0">
                <CardHeader>
                  <CardTitle className="text-xl leading-8">{tag.name}</CardTitle>
                  {tag.description && <CardDescription className="my-2">{tag.description}</CardDescription>}
                  <p className="text-sm font-medium mt-4">{t('common:operation', { count: tag.count })}</p>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 rdg-readonly">
                  {/* Readonly data table with operations in this tag */}
                  <TagOperationsTable operations={tagOperations} tagName={tag.name as TagName} />

                  {/* Show details button */}
                  <div className="flex w-full justify-center">
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

                {/* Operation details list */}
                <CollapsibleContent>
                  <Suspense>
                    <div className="border-t">
                      {tagOperations.map((operation) => (
                        <OperationDetail key={operation.hash} operation={operation} />
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

export default OperationsListPage;
