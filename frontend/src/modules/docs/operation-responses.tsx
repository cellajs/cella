import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { JsonViewer } from '~/modules/common/json-viewer';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '~/modules/ui/accordion';
import { cn } from '~/utils/cn';
import { getStatusColor } from './helpers/get-status-color';
import type { GenOperationDetail, GenResponseSummary } from './types';

/**
 * Query options for fetching tag operation details.
 */
export const tagDetailsQueryOptions = (tagName: string) =>
  queryOptions({
    queryKey: ['docs', 'tag-details', tagName],
    queryFn: async () => {
      const module = await import(`~/api.gen/docs/details/${tagName}.gen.ts`);
      return module.operations as GenOperationDetail[];
    },
    staleTime: Number.POSITIVE_INFINITY, // Never stale - generated at build time
  });

interface ResponsesAccordionProps {
  responses: GenResponseSummary[];
}

/**
 * Accordion component to display operation responses.
 */
const ResponsesAccordion = ({ responses }: ResponsesAccordionProps) => {
  const { t } = useTranslation();

  if (responses.length === 0) {
    return <div className="text-sm text-muted-foreground py-2">{t('common:docs.no_responses_defined')}</div>;
  }

  return (
    <Accordion type="single" className="w-full" collapsible>
      {responses.map((response) => (
        <AccordionItem key={response.status} value={String(response.status)}>
          <AccordionTrigger className="py-2 group opacity-80 hover:opacity-100 group-data-[state=open]:opacity-100">
            <div className="flex items-center justify-between w-full pr-2">
              <div className="flex items-center gap-3">
                <span
                  className={`font-mono text-sm font-semibold px-2 py-0.5 rounded group-data-[state=open]:opacity-100 ${getStatusColor(response.status)}`}
                >
                  {response.status}
                </span>
                <span className="text-sm text-muted-foreground group-data-[state=open]:text-foreground">
                  {response.description}
                </span>
              </div>
              {response.name && (
                <span className="max-sm:hidden text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                  {response.name}
                </span>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            {response.schema ? (
              <div className="p-3 rounded-md bg-muted/50">
                <JsonViewer
                  value={response.schema}
                  showKeyQuotes={false}
                  singleLineArrays={true}
                  openapiMode="schema"
                  rootName={false}
                  defaultInspectDepth={4}
                  indentWidth={2}
                />
              </div>
            ) : (
              <div className="p-3 text-sm text-muted-foreground">{t('common:docs.no_response_body')}</div>
            )}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
};

interface OperationResponsesProps {
  operationId: string;
  tagName: string;
}

/**
 * Operation responses component that uses useSuspenseQuery for Suspense integration.
 * Wrap the parent component in a Suspense boundary for optimal batching.
 */
export const OperationResponses = ({ operationId, tagName }: OperationResponsesProps) => {
  const { data: operations } = useSuspenseQuery(tagDetailsQueryOptions(tagName));
  const operation = operations.find((op) => op.operationId === operationId);
  const responses = operation?.responses ?? [];

  return <ResponsesAccordion responses={responses} />;
};

interface TagExpandButtonProps {
  tagName: string;
  isOpen: boolean;
}

/**
 * Button content that triggers data load via useSuspenseQuery.
 * When wrapped in Suspense, shows loading state until data is ready.
 */
export const TagExpandButtonContent = ({ tagName, isOpen }: TagExpandButtonProps) => {
  const { t } = useTranslation();
  // This triggers the Suspense - data will be cached for when content renders
  useSuspenseQuery(tagDetailsQueryOptions(tagName));

  return (
    <>
      {t('common:docs.hide_details')}
      <ChevronDown
        className={cn('ml-2 h-4 w-4 transition-transform duration-200 opacity-50', isOpen && 'rotate-180')}
      />
    </>
  );
};

/**
 * Loading fallback for the expand button - shows spinner instead of chevron
 */
export const TagExpandButtonLoading = () => {
  const { t } = useTranslation();
  return (
    <>
      {t('common:docs.show_details')}
      <Loader2 className="ml-2 h-4 w-4 animate-spin opacity-50" />
    </>
  );
};
