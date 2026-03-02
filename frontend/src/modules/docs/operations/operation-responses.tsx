import { useSuspenseQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronDownIcon, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '~/modules/ui/accordion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import { cn } from '~/utils/cn';
import {
  type DefinitionIndex,
  getTypeCodeForResponse,
  getZodCodeForResponse,
  typesIndexQueryOptions,
  zodIndexQueryOptions,
} from '../helpers/extract-types';
import { getStatusColor } from '../helpers/get-status-color';
import { schemasQueryOptions, tagDetailsQueryOptions } from '../query';
import type { GenComponentSchema, GenOperationDetail, GenResponseSummary, GenSchema } from '../types';
import { ViewerGroup } from '../viewer-group';

/** Resolve response schema, looking up by name from prefetched schemas for error responses */
function resolveResponseSchema(response: GenResponseSummary, schemas: GenComponentSchema[]): GenSchema | undefined {
  if (response.schema) return response.schema;
  // For error responses (no embedded schema), look up by name in schemas.gen.json
  if (response.name) {
    const schemaEntry = schemas.find((s) => s.name === response.name);
    return schemaEntry?.schema;
  }
  return undefined;
}

interface ResponsesAccordionProps {
  responses: GenResponseSummary[];
  schemas: GenComponentSchema[];
  operationId: string;
  zodIndex: DefinitionIndex;
  typesIndex: DefinitionIndex;
}

/**
 * Accordion component to display operation responses.
 */
function ResponsesAccordion({ responses, schemas, operationId, zodIndex, typesIndex }: ResponsesAccordionProps) {
  const { t } = useTranslation();

  if (responses.length === 0) {
    return <div className="text-sm text-muted-foreground py-2">{t('common:docs.no_responses_defined')}</div>;
  }

  return (
    <Accordion type="single" className="w-full" collapsible>
      {responses.map((response) => {
        const schema = resolveResponseSchema(response, schemas);
        return (
          <AccordionItem key={response.status} value={String(response.status)}>
            <AccordionTrigger className="py-2 group opacity-80 hover:opacity-100 group-data-[state=open]:opacity-100">
              <div className="flex items-center justify-between w-full pr-2 gap-3">
                <div
                  className={`font-mono text-sm font-semibold px-2 py-0.5 rounded group-data-[state=open]:opacity-100 ${getStatusColor(response.status)}`}
                >
                  {response.status}
                </div>
                <div className="text-sm text-muted-foreground grow group-data-[state=open]:text-foreground">
                  {response.description}
                </div>
                {response.name && (
                  <span className="max-md:hidden truncate text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                    {response.name}
                  </span>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {schema ? (
                <ViewerGroup
                  schema={schema}
                  zodCode={getZodCodeForResponse(zodIndex, operationId, response.status, response.name)}
                  typeCode={getTypeCodeForResponse(typesIndex, operationId, response.status)}
                  example={response.example}
                />
              ) : (
                <div className="p-3 text-sm text-muted-foreground">{t('common:docs.no_response_body')}</div>
              )}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

interface OperationResponsesProps {
  detail?: GenOperationDetail;
}

/**
 * Operation responses component that uses useSuspenseQuery for Suspense integration.
 * Wrap the parent component in a Suspense boundary for optimal batching.
 */
export const OperationResponses = ({ detail }: OperationResponsesProps) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(true);

  const { data: schemas } = useSuspenseQuery(schemasQueryOptions);
  const { data: zodIndex } = useSuspenseQuery(zodIndexQueryOptions);
  const { data: typesIndex } = useSuspenseQuery(typesIndexQueryOptions);

  const responses = detail?.responses ?? [];

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-8">
      <CollapsibleTrigger className="flex items-center gap-2 group w-full text-left">
        <h4 className="text-sm font-medium">{t('common:docs.responses')}</h4>
        <ChevronDownIcon
          className={cn(
            'size-4 transition-transform duration-200 opacity-40 group-hover:opacity-70',
            isOpen && 'rotate-180',
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="mt-2">
          <ResponsesAccordion
            responses={responses}
            schemas={schemas}
            operationId={detail?.operationId ?? ''}
            zodIndex={zodIndex}
            typesIndex={typesIndex}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
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
    <span className="contents group" data-open={isOpen}>
      {t('common:docs.hide_details')}
      <ChevronDown className="ml-2 h-4 w-4 transition-transform duration-200 opacity-50 group-data-[open=true]:rotate-180" />
    </span>
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
