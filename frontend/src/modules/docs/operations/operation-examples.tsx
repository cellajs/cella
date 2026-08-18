import { useSuspenseQuery } from '@tanstack/react-query';
import i18n from 'i18next';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { Spinner } from '~/modules/common/spinner';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '~/modules/ui/accordion';
import {
  type DefinitionIndex,
  getTypeCodeForResponse,
  getZodCodeForResponse,
  typesIndexQueryOptions,
  zodIndexQueryOptions,
} from '../helpers/extract-types';
import { getStatusColor } from '../helpers/get-status-color';
import { schemasQueryOptions, tagDetailsQueryOptions } from '../query';
import type { GenComponentSchema, GenOperationSummary, GenResponseSummary, GenSchema } from '../types';
import { ViewerGroup } from '../viewer-group';

function resolveResponseSchema(response: GenResponseSummary, schemas: GenComponentSchema[]): GenSchema | undefined {
  if (response.schema) return response.schema;
  if (response.name) {
    const schemaEntry = schemas.find((s) => s.name === response.name);
    return schemaEntry?.schema;
  }
  return undefined;
}

interface ExamplesAccordionProps {
  responses: GenResponseSummary[];
  schemas: GenComponentSchema[];
  operationId: string;
  zodIndex: DefinitionIndex;
  typesIndex: DefinitionIndex;
}

/** Lists only responses that carry an example, with the example view preselected. */
function ExamplesAccordion({ responses, schemas, operationId, zodIndex, typesIndex }: ExamplesAccordionProps) {
  const { t } = useTranslation();

  const responsesWithExamples = responses.filter((r) => r.example !== undefined);

  if (responsesWithExamples.length === 0) {
    return <div className="py-2 text-muted-foreground text-sm">{t('c:docs.no_examples_defined')}</div>;
  }

  const defaultValue = [String(responsesWithExamples[0].status)];

  return (
    <Accordion className="w-full" defaultValue={defaultValue}>
      {responsesWithExamples.map((response) => {
        const schema = resolveResponseSchema(response, schemas);
        return (
          <AccordionItem key={response.status} value={String(response.status)}>
            <AccordionTrigger className="group py-2 opacity-80 hover:opacity-100 group-data-open:opacity-100">
              <div className="flex w-full items-center justify-between gap-3 pr-2">
                <div
                  className={`rounded px-2 py-0.5 font-mono font-semibold text-sm group-data-open:opacity-100 ${getStatusColor(response.status)}`}
                >
                  {response.status}
                </div>
                <div className="grow text-muted-foreground text-sm group-data-open:text-foreground">
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
                  defaultViewMode="example"
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

interface OperationExamplesProps {
  operationId: string;
  tagName: string;
}

export function openExamplesSheet(operation: GenOperationSummary, trigger: HTMLButtonElement | HTMLAnchorElement) {
  useSheeter.getState().create(
    <Suspense fallback={<Spinner className="mt-[40vh]" />}>
      <div className="container pt-3 pb-[50vh]">
        <OperationExamples operationId={operation.id} tagName={operation.tags[0]} />
      </div>
    </Suspense>,
    {
      id: `examples-${operation.id}`,
      triggerRef: { current: trigger },
      side: 'right',
      className: 'max-w-full lg:max-w-4xl',
      title: i18n.t('c:docs.success_response'),
    },
  );
}

/** Wrap the parent component in a Suspense boundary for optimal batching. */
export function OperationExamples({ operationId, tagName }: OperationExamplesProps) {
  const { t } = useTranslation();

  const { data: operations } = useSuspenseQuery(tagDetailsQueryOptions(tagName));
  const { data: schemas } = useSuspenseQuery(schemasQueryOptions);
  const { data: zodIndex } = useSuspenseQuery(zodIndexQueryOptions);
  const { data: typesIndex } = useSuspenseQuery(typesIndexQueryOptions);

  const operation = operations.find((op) => op.operationId === operationId);
  const responses = operation?.responses ?? [];

  const successResponsesWithExamples = responses.filter(
    (r) => r.status >= 200 && r.status < 300 && r.example !== undefined,
  );

  if (successResponsesWithExamples.length === 0) {
    return <div className="py-4 text-center text-muted-foreground">{t('c:docs.no_examples_defined')}</div>;
  }

  return (
    <ExamplesAccordion
      responses={responses}
      schemas={schemas}
      operationId={operationId}
      zodIndex={zodIndex}
      typesIndex={typesIndex}
    />
  );
}
