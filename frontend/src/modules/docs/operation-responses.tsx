import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { ChevronDown, Loader2 } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '~/modules/ui/accordion';
import { cn } from '~/utils/cn';
import { getStatusColor } from './helpers/get-status-color';

interface ResponseSummary {
  status: number;
  description: string;
}

export interface OperationDetail {
  operationId: string;
  responses: ResponseSummary[];
}

/**
 * Query options for fetching tag operation details.
 */
export const tagDetailsQueryOptions = (tagName: string) =>
  queryOptions({
    queryKey: ['docs', 'tag-details', tagName],
    queryFn: async () => {
      const module = await import(`~/api.gen/docs/details/${tagName}.gen.ts`);
      return module.operations as OperationDetail[];
    },
    staleTime: Number.POSITIVE_INFINITY, // Never stale - generated at build time
  });

interface ResponsesAccordionProps {
  responses: ResponseSummary[];
}

const ResponsesAccordion = ({ responses }: ResponsesAccordionProps) => {
  if (responses.length === 0) {
    return <div className="text-sm text-muted-foreground py-2">No responses defined</div>;
  }

  return (
    <Accordion type="multiple" className="w-full">
      {responses.map((response) => (
        <AccordionItem key={response.status} value={String(response.status)}>
          <AccordionTrigger className="py-2">
            <div className="flex items-center gap-3">
              <span
                className={`font-mono text-sm font-semibold px-2 py-0.5 rounded ${getStatusColor(response.status)}`}
              >
                {response.status}
              </span>
              <span className="text-sm text-muted-foreground">{response.description}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="text-sm text-muted-foreground italic">Schema details coming soon...</div>
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

/**
 * Loading fallback component for the tag operations Suspense boundary
 */
export const TagOperationsLoading = () => (
  <div className="p-6 text-center text-muted-foreground">Loading operation details...</div>
);

interface TagExpandButtonProps {
  tagName: string;
  count: number;
  isOpen: boolean;
}

/**
 * Button content that triggers data load via useSuspenseQuery.
 * When wrapped in Suspense, shows loading state until data is ready.
 */
export const TagExpandButtonContent = ({ tagName, count, isOpen }: TagExpandButtonProps) => {
  // This triggers the Suspense - data will be cached for when content renders
  useSuspenseQuery(tagDetailsQueryOptions(tagName));

  const endpointLabel = count === 1 ? 'endpoint' : 'endpoints';

  return (
    <>
      {count} {endpointLabel}
      <ChevronDown
        className={cn('ml-2 h-4 w-4 transition-transform duration-200 opacity-50', isOpen && 'rotate-180')}
      />
    </>
  );
};

/**
 * Loading fallback for the expand button - shows spinner instead of chevron
 */
export const TagExpandButtonLoading = ({ count }: { count: number }) => {
  const endpointLabel = count === 1 ? 'endpoint' : 'endpoints';

  return (
    <>
      {count} {endpointLabel}
      <Loader2 className="ml-2 h-4 w-4 animate-spin opacity-50" />
    </>
  );
};
