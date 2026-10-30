import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { GenComponentSchema, GenOperationDetail, GenResponseSummary, GenSchema } from 'sdk/docs-types';
import { type DefinitionIndex, getTypeCodeForResponse, getZodCodeForResponse } from '~/modules/docs/helpers/extract-types';
import { getStatusColor } from '~/modules/docs/helpers/get-status-color';
import { OperationSection } from '~/modules/docs/operations/operation-section';
import { schemasQueryOptions, useDefinitionIndexes } from '~/modules/docs/query';
import { ViewerGroup } from '~/modules/docs/viewer-group';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '~/modules/ui/accordion';
import { cn } from '~/utils/cn';

function resolveResponseSchema(response: GenResponseSummary, schemas: GenComponentSchema[]): GenSchema | undefined {
  if (response.schema) return response.schema;
  // For error responses (no embedded schema), look up by name in schemas.gen.json
  if (response.name) return schemas.find((schema) => schema.name === response.name)?.schema;
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

export function ResponsesAccordion({ responses: allResponses, schemas, operationId, zodIndex, typesIndex, examplesOnly }: ResponsesAccordionProps) {
  const { t } = useTranslation();

  const responses = examplesOnly ? allResponses.filter((response) => response.example !== undefined) : allResponses;

  if (responses.length === 0) {
    return (
      <div className="py-2 text-muted-foreground text-sm">{examplesOnly ? t('c:docs.no_examples_defined') : t('c:docs.no_responses_defined')}</div>
    );
  }

  return (
    <Accordion defaultValue={examplesOnly ? [String(responses[0].status)] : undefined}>
      {responses.map((response) => {
        const schema = resolveResponseSchema(response, schemas);
        return (
          <AccordionItem key={response.status} value={String(response.status)}>
            <AccordionTrigger className="focus-inset py-2 font-normal text-foreground-soft hover:text-foreground hover:no-underline group-data-open/accordion-header:text-foreground [&>svg]:size-4 [&>svg]:translate-y-1">
              <div className="flex w-full items-center justify-between gap-3 pr-2">
                <div className={cn('rounded px-2 py-0.5 font-mono font-semibold transition-colors', getStatusColor(response.status))}>
                  {response.status}
                </div>
                <div
                  className={cn(
                    'link-decoration group-active/accordion-header:link-decoration-strong grow group-hover/accordion-header:underline',
                    examplesOnly
                      ? 'text-muted-foreground group-data-open/accordion-header:text-foreground'
                      : 'text-foreground group-data-open/accordion-header:text-primary',
                  )}
                >
                  {response.description}
                </div>
                {response.name && (
                  <span className="truncate rounded bg-muted px-2 py-0.5 font-mono text-muted-foreground text-xs transition-colors group-hover/accordion-header:text-foreground max-md:hidden">
                    {response.name}
                  </span>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {response.headers && (
                <dl className="flex max-w-measure flex-wrap gap-x-4 gap-y-1 px-3 pt-2 text-sm">
                  {response.headers.map((header) => (
                    <div key={header.name}>
                      <dt className="inline font-mono text-foreground-soft">{header.name}</dt>
                      <dd className="inline text-muted-foreground"> {header.description}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {schema ? (
                <ViewerGroup
                  schema={schema}
                  zodCode={getZodCodeForResponse(zodIndex, operationId, response.status, response.name)}
                  typeCode={getTypeCodeForResponse(typesIndex, operationId, response.status)}
                  example={response.example}
                  defaultViewMode={examplesOnly ? 'example' : undefined}
                  descriptionToggle
                />
              ) : (
                <div className="p-3 text-muted-foreground">{t('c:docs.no_response_body')}</div>
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
  const { zodIndex, typesIndex } = useDefinitionIndexes();

  return (
    <OperationSection title={t('c:docs.responses')}>
      <div className="mt-2">
        <ResponsesAccordion
          responses={detail?.responses ?? []}
          schemas={schemas}
          operationId={detail?.operationId ?? ''}
          zodIndex={zodIndex}
          typesIndex={typesIndex}
        />
      </div>
    </OperationSection>
  );
}
