import { useSuspenseQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { GenComponentSchema, GenOperationDetail, GenResponseSummary } from 'sdk/docs-types';
import { type DefinitionIndex, getTypeCodeForResponse, getZodCodeForResponse } from '~/modules/docs/helpers/extract-types';
import { OperationSection } from '~/modules/docs/operations/operation-section';
import { schemasQueryOptions, useDefinitionIndexes } from '~/modules/docs/query';
import { SchemaLink, useSchemaRefLink } from '~/modules/docs/schemas/schema-detail';
import { SpecText } from '~/modules/docs/spec-text';
import { ViewerGroup } from '~/modules/docs/viewer-group';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '~/modules/ui/accordion';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

const statusBadgeClass = tw('rounded px-2 py-0.5 font-mono font-semibold transition-colors');
const triggerClass = tw(
  'focus-inset text-foreground-soft hover:text-foreground group-data-open/accordion-header:text-foreground py-2 font-normal hover:no-underline [&>svg]:size-4 [&>svg]:translate-y-1',
);

/** Status badge colors by status class, one step stronger while its accordion row is hovered. */
const getStatusColor = (status: number): string => {
  if (status >= 200 && status < 300) {
    return 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/50 group-hover/accordion-header:text-emerald-800 group-hover/accordion-header:bg-emerald-100 dark:group-hover/accordion-header:text-emerald-200 dark:group-hover/accordion-header:bg-emerald-900/60';
  }
  if (status >= 300 && status < 400) {
    return 'text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-950/50 group-hover/accordion-header:text-blue-800 group-hover/accordion-header:bg-blue-100 dark:group-hover/accordion-header:text-blue-200 dark:group-hover/accordion-header:bg-blue-900/60';
  }
  if (status >= 400 && status < 500) {
    return 'text-orange-700 bg-orange-50 dark:text-orange-300 dark:bg-orange-950/50 group-hover/accordion-header:text-orange-800 group-hover/accordion-header:bg-orange-100 dark:group-hover/accordion-header:text-orange-200 dark:group-hover/accordion-header:bg-orange-900/60';
  }
  if (status >= 500) {
    return 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/50 group-hover/accordion-header:text-red-800 group-hover/accordion-header:bg-red-100 dark:group-hover/accordion-header:text-red-200 dark:group-hover/accordion-header:bg-red-900/60';
  }
  return 'text-gray-700 bg-gray-50 dark:text-gray-300 dark:bg-gray-950/50 group-hover/accordion-header:text-gray-800 group-hover/accordion-header:bg-gray-100 dark:group-hover/accordion-header:text-gray-200 dark:group-hover/accordion-header:bg-gray-900/60';
};

/** A response that refers to a shared error component, which the backend documents once for every route answering that status. */
const isSharedError = (response: GenResponseSummary) => response.ref?.startsWith('#/components/responses/') ?? false;

const isError = (response: GenResponseSummary) => response.status >= 400;

/** Chip of a name under a response: a body schema or a header. */
const chipClass = tw('bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-xs');

interface ResponseLineProps {
  label: string;
  chip: ReactNode;
  text?: string;
  className?: string;
}

/** A line under a response, such as "Body Me" or "Header Retry-After" and its text, one shape for both. */
function ResponseLine({ label, chip, text, className }: ResponseLineProps) {
  return (
    <p className={cn('text-muted-foreground', className)}>
      {label} {chip}
      {text && (
        <span className="text-foreground-soft">
          {' '}
          <SpecText text={text} />
        </span>
      )}
    </p>
  );
}

/** The documented headers of a response, a line each. */
function ResponseHeaders({ headers, className }: { headers: NonNullable<GenResponseSummary['headers']>; className?: string }) {
  const { t } = useTranslation();

  return headers.map((header) => (
    <ResponseLine
      key={header.name}
      label={t('c:docs.header')}
      chip={<code className={chipClass}>{header.name}</code>}
      text={header.description}
      className={className}
    />
  ));
}

interface ErrorsItemProps {
  responses: GenResponseSummary[];
  schemas: GenComponentSchema[];
  operationId: string;
  zodIndex: DefinitionIndex;
  typesIndex: DefinitionIndex;
}

/** One row for every error response: each status with its label, text and headers, and its body at the end of its label line. */
function ErrorsItem({ responses, schemas, operationId, zodIndex, typesIndex }: ErrorsItemProps) {
  const { t } = useTranslation();
  const renderRef = useSchemaRefLink();

  const statusClasses = new Set(responses.map((response) => Math.floor(response.status / 100)));

  return (
    <AccordionItem value="errors">
      <AccordionTrigger className={triggerClass}>
        <div className="flex w-full items-center justify-between gap-3 pr-2">
          {statusClasses.size === 1 && <div className={cn(statusBadgeClass, getStatusColor(responses[0].status))}>{[...statusClasses][0]}xx</div>}
          <div className="link-decoration group-active/accordion-header:link-decoration-strong text-foreground group-data-open/accordion-header:text-primary grow group-hover/accordion-header:underline">
            {t('c:docs.errors')}
          </div>
          <span className="text-muted-foreground flex gap-2 font-mono text-xs max-md:hidden">
            {responses.map((response) => (
              <span key={response.status}>{response.status}</span>
            ))}
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <dl className="flex flex-col gap-4 px-3 pt-1">
          {responses.map((response) => {
            const named = response.name ? schemas.find((schema) => schema.name === response.name) : undefined;
            const shared = isSharedError(response);
            // A shared error's text is the description of its body schema, which extends the body all of them share
            const text = shared ? named?.description : response.detail;
            const body = shared && named?.extendsRef ? (schemas.find((schema) => schema.ref === named.extendsRef) ?? named) : named;
            const inlineSchema = named ? undefined : response.schema;
            return (
              <div key={response.status} className="flex items-start gap-3">
                <dt className={cn(statusBadgeClass, getStatusColor(response.status))}>{response.status}</dt>
                <dd className="min-w-0 grow">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-foreground font-medium">{response.description}</span>
                    {body && <SchemaLink schema={body} className={chipClass} />}
                    {!body && !inlineSchema && <span className="text-muted-foreground text-xs">{t('c:docs.no_response_body')}</span>}
                  </div>
                  {text && (
                    <p className="max-w-measure text-foreground-soft mt-0.5">
                      <SpecText text={text} />
                    </p>
                  )}
                  {response.headers && <ResponseHeaders headers={response.headers} className="max-w-measure mt-1.5" />}
                  {inlineSchema && (
                    <div className="mt-2">
                      <ViewerGroup
                        schema={inlineSchema}
                        zodCode={getZodCodeForResponse(zodIndex, operationId, response.status, response.name)}
                        typeCode={getTypeCodeForResponse(typesIndex, operationId, response.status)}
                        example={response.example}
                        renderRef={renderRef}
                      />
                    </div>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </AccordionContent>
    </AccordionItem>
  );
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
  const renderRef = useSchemaRefLink();

  const responses = examplesOnly ? allResponses.filter((response) => response.example !== undefined) : allResponses;
  const rows = responses.filter((response) => !isError(response));
  const errors = responses.filter(isError);

  if (responses.length === 0) {
    return (
      <div className="text-muted-foreground py-2 text-sm">{examplesOnly ? t('c:docs.no_examples_defined') : t('c:docs.no_responses_defined')}</div>
    );
  }

  return (
    <Accordion defaultValue={examplesOnly && rows.length ? [String(rows[0].status)] : undefined}>
      {rows.map((response) => {
        const namedBody = response.name ? schemas.find((entry) => entry.name === response.name) : undefined;
        // For error responses (no embedded schema), look up by name in schemas.gen.json
        const schema = response.schema ?? namedBody?.schema;
        return (
          <AccordionItem key={response.status} value={String(response.status)}>
            <AccordionTrigger className={triggerClass}>
              <div className="flex w-full items-center justify-between gap-3 pr-2">
                <div className={cn(statusBadgeClass, getStatusColor(response.status))}>{response.status}</div>
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
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {response.detail && (
                <p className="max-w-measure text-foreground-soft px-3 pt-1 pb-3">
                  <SpecText text={response.detail} />
                </p>
              )}
              {(namedBody || response.headers) && (
                <div className="max-w-measure flex flex-col gap-1.5 px-3 pt-1 pb-3">
                  {/* A link cannot sit in the trigger button, so the body's schema link follows the detail in the panel */}
                  {namedBody && <ResponseLine label={t('c:docs.body')} chip={<SchemaLink schema={namedBody} className={chipClass} />} />}
                  {response.headers && <ResponseHeaders headers={response.headers} />}
                </div>
              )}
              {schema ? (
                <ViewerGroup
                  schema={schema}
                  zodCode={getZodCodeForResponse(zodIndex, operationId, response.status, response.name)}
                  typeCode={getTypeCodeForResponse(typesIndex, operationId, response.status)}
                  example={response.example}
                  defaultViewMode={examplesOnly ? 'example' : undefined}
                  renderRef={renderRef}
                />
              ) : (
                <div className="text-muted-foreground p-3">{t('c:docs.no_response_body')}</div>
              )}
            </AccordionContent>
          </AccordionItem>
        );
      })}
      {errors.length > 0 && <ErrorsItem responses={errors} {...{ schemas, operationId, zodIndex, typesIndex }} />}
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
        <ResponsesAccordion responses={detail?.responses ?? []} operationId={detail?.operationId ?? ''} {...{ schemas, zodIndex, typesIndex }} />
      </div>
    </OperationSection>
  );
}
