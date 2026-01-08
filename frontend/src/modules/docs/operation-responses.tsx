import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { ChevronDown, Loader2 } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '~/modules/ui/accordion';
import { cn } from '~/utils/cn';
import { getStatusColor } from './helpers/get-status-color';
import { JsonEditor } from './json-viewer';
import type { GenOperationDetail, GenResponseSummary } from './types';

// Mockup schema inspired by zUser - this will be replaced with actual schema data
const mockUserSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Unique identifier', xRequired: true },
    entityType: { type: 'string', enum: ['user'], description: 'Entity type discriminator', xRequired: true },
    name: { type: 'string', description: 'Display name', xRequired: true },
    email: { type: 'string', format: 'email', description: 'Email address', xRequired: true },
    slug: { type: 'string', description: 'URL-friendly identifier', xRequired: true },
    description: { type: ['string', 'null'], description: 'User bio or description', xRequired: false },
    thumbnailUrl: { type: ['string', 'null'], description: 'Profile picture URL', xRequired: false },
    bannerUrl: { type: ['string', 'null'], description: 'Banner image URL', xRequired: false },
    firstName: { type: ['string', 'null'], xRequired: false },
    lastName: { type: ['string', 'null'], xRequired: false },
    language: { type: 'string', enum: ['en', 'nl'], description: 'Preferred language', xRequired: true },
    newsletter: { type: 'boolean', description: 'Newsletter subscription status', xRequired: true },
    mfaRequired: { type: 'boolean', description: 'Whether MFA is required', xRequired: true },
    userFlags: {
      type: 'object',
      xRequired: false,
      properties: {
        finishedOnboarding: { type: 'boolean', xRequired: true },
      },
    },
    createdAt: { type: 'string', format: 'date-time', xRequired: true },
    modifiedAt: { type: ['string', 'null'], format: 'date-time', xRequired: false },
    lastSeenAt: { type: ['string', 'null'], format: 'date-time', xRequired: false },
    lastStartedAt: { type: ['string', 'null'], format: 'date-time', xRequired: false },
    lastSignInAt: { type: ['string', 'null'], format: 'date-time', xRequired: false },
    modifiedBy: { type: ['string', 'null'], xRequired: false },
  },
};

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

const ResponsesAccordion = ({ responses }: ResponsesAccordionProps) => {
  if (responses.length === 0) {
    return <div className="text-sm text-muted-foreground py-2">No responses defined</div>;
  }

  return (
    <Accordion type="multiple" className="w-full">
      {responses.map((response) => (
        <AccordionItem key={response.status} value={String(response.status)}>
          <AccordionTrigger className="py-2">
            <div className="flex items-center justify-between w-full pr-2">
              <div className="flex items-center gap-3">
                <span
                  className={`font-mono text-sm font-semibold px-2 py-0.5 rounded ${getStatusColor(response.status)}`}
                >
                  {response.status}
                </span>
                <span className="text-sm text-muted-foreground">{response.description}</span>
              </div>
              {response.name && (
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                  {response.name}
                </span>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="p-3 rounded-md bg-muted/50">
              <JsonEditor
                hideRoot
                enableSingleLineArrays
                enableRequiredAsLabel
                hideBrackets
                data={mockUserSchema}
                collapse={4}
                restrictEdit={true}
                searchFilter="all"
                enableClipboard={false}
                restrictDelete
                restrictAdd
                showStringQuotes={false}
                showArrayIndices={false}
                showCollectionCount="when-closed"
                indent={2}
                rootFontSize="13px"
              />
            </div>
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

  const operationLabel = count === 1 ? 'operation' : 'operations';

  return (
    <>
      {count} {operationLabel}
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
  const operationLabel = count === 1 ? 'operation' : 'operations';

  return (
    <>
      {count} {operationLabel}
      <Loader2 className="ml-2 h-4 w-4 animate-spin opacity-50" />
    </>
  );
};
