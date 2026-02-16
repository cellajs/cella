import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '~/modules/ui/accordion';
import {
  getTypeCodeForResponse,
  getZodCodeForResponse,
  typesContentQueryOptions,
  zodContentQueryOptions,
} from '../helpers/extract-types';
import { getStatusColor } from '../helpers/get-status-color';
import { schemasQueryOptions, tagDetailsQueryOptions } from '../query';
import type { GenComponentSchema, GenResponseSummary, GenSchema } from '../types';
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

interface ExamplesAccordionProps {
  responses: GenResponseSummary[];
  schemas: GenComponentSchema[];
  operationId: string;
  zodContent: string;
  typesContent: string;
}

/**
 * Accordion component to display operation response examples.
 * Only shows responses that have examples, with example view preselected.
 */
function ExamplesAccordion({ responses, schemas, operationId, zodContent, typesContent }: ExamplesAccordionProps) {
  const { t } = useTranslation();

  // Filter to only responses with examples
  const responsesWithExamples = responses.filter((r) => r.example !== undefined);

  if (responsesWithExamples.length === 0) {
    return <div className="text-sm text-muted-foreground py-2">{t('common:docs.no_examples_defined')}</div>;
  }

  // Default to first response with example expanded
  const defaultValue = String(responsesWithExamples[0].status);

  return (
    <Accordion type="single" className="w-full" collapsible defaultValue={defaultValue}>
      {responsesWithExamples.map((response) => {
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
                  zodCode={getZodCodeForResponse(zodContent, operationId, response.status, response.name)}
                  typeCode={getTypeCodeForResponse(typesContent, operationId, response.status)}
                  example={response.example}
                  defaultViewMode="example"
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

interface OperationExamplesProps {
  operationId: string;
  tagName: string;
}

/**
 * Operation examples component that shows responses with examples.
 * Wrap the parent component in a Suspense boundary for optimal batching.
 */
export const OperationExamples = ({ operationId, tagName }: OperationExamplesProps) => {
  const { t } = useTranslation();

  const { data: operations } = useSuspenseQuery(tagDetailsQueryOptions(tagName));
  const { data: schemas } = useSuspenseQuery(schemasQueryOptions);
  const { data: zodContent } = useSuspenseQuery(zodContentQueryOptions);
  const { data: typesContent } = useSuspenseQuery(typesContentQueryOptions);

  const operation = operations.find((op) => op.operationId === operationId);
  const responses = operation?.responses ?? [];

  // Filter to only success responses (2xx) with examples
  const successResponsesWithExamples = responses.filter(
    (r) => r.status >= 200 && r.status < 300 && r.example !== undefined,
  );

  if (successResponsesWithExamples.length === 0) {
    return <div className="py-4 text-center text-muted-foreground">{t('common:docs.no_examples_defined')}</div>;
  }

  return (
    <ExamplesAccordion
      responses={responses}
      schemas={schemas}
      operationId={operationId}
      zodContent={zodContent}
      typesContent={typesContent}
    />
  );
};
