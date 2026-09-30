import { useSuspenseQuery } from '@tanstack/react-query';
import { ChevronDownIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GenComponentSchema, GenOperationDetail, GenResponseSummary, GenSchema } from 'sdk/docs-types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '~/modules/ui/accordion';
import { Button } from '~/modules/ui/button';
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
import { schemasQueryOptions } from '../query';
import { ViewerGroup } from '../viewer-group';

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
  /** Lists only responses that carry an example, with the first one open in example view. */
  examplesOnly?: boolean;
}

export function ResponsesAccordion({
  responses: allResponses,
  schemas,
  operationId,
  zodIndex,
  typesIndex,
  examplesOnly,
}: ResponsesAccordionProps) {
  const { t } = useTranslation();

  const responses = examplesOnly ? allResponses.filter((r) => r.example !== undefined) : allResponses;

  if (responses.length === 0) {
    return (
      <div className="py-2 text-muted-foreground text-sm">
        {examplesOnly ? t('c:docs.no_examples_defined') : t('c:docs.no_responses_defined')}
      </div>
    );
  }

  return (
    <Accordion className="w-full" defaultValue={examplesOnly ? [String(responses[0].status)] : undefined}>
      {responses.map((response) => {
        const schema = resolveResponseSchema(response, schemas);
        return (
          <AccordionItem key={response.status} value={String(response.status)}>
            <AccordionTrigger className="group py-2 opacity-80 hover:opacity-100 group-data-open:opacity-100">
              <div className="flex w-full items-center justify-between gap-3 pr-2">
                <div
                  className={cn(
                    'rounded px-2 py-0.5 font-mono font-semibold text-sm group-data-open:opacity-100',
                    !examplesOnly && 'decoration-transparent',
                    getStatusColor(response.status),
                  )}
                >
                  {response.status}
                </div>
                <div
                  className={cn(
                    'grow text-sm',
                    examplesOnly
                      ? 'text-muted-foreground group-data-open:text-foreground'
                      : 'text-foreground group-data-open:text-primary',
                  )}
                >
                  {response.description}
                </div>
                {response.name && (
                  <span className="truncate rounded bg-muted px-2 py-0.5 font-mono text-muted-foreground text-xs max-md:hidden">
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
                  defaultViewMode={examplesOnly ? 'example' : undefined}
                />
              ) : (
                <div className="p-3 text-muted-foreground text-sm">{t('c:docs.no_response_body')}</div>
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

export function OperationResponses({ detail }: OperationResponsesProps) {
  const { t } = useTranslation();

  const { data: schemas } = useSuspenseQuery(schemasQueryOptions);
  const { data: zodIndex } = useSuspenseQuery(zodIndexQueryOptions);
  const { data: typesIndex } = useSuspenseQuery(typesIndexQueryOptions);

  const responses = detail?.responses ?? [];

  return (
    <Collapsible defaultOpen className="mt-8">
      <CollapsibleTrigger
        nativeButton
        render={
          <Button variant="ghost" size="sm" className="group w-full justify-start gap-2">
            <span className="font-medium text-sm">{t('c:docs.responses')}</span>
            <ChevronDownIcon className="size-4 opacity-40 transition-transform duration-200 group-hover:opacity-70 group-data-panel-open:rotate-180" />
          </Button>
        }
      />
      <CollapsibleContent className="overflow-hidden data-closed:animate-collapsible-up data-open:animate-collapsible-down">
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
}
