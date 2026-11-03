import { useSuspenseQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { GenComponentSchema, GenOperationDetail, GenResponseSummary, GenSchema } from 'sdk/docs-types';
import { type DefinitionIndex, getTypeCodeForResponse, getZodCodeForResponse } from '~/modules/docs/helpers/extract-types';
import { getStatusColor } from '~/modules/docs/helpers/get-status-color';
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
  'focus-inset py-2 font-normal text-foreground-soft hover:text-foreground hover:no-underline group-data-open/accordion-header:text-foreground [&>svg]:size-4 [&>svg]:translate-y-1',
);

function resolveResponseSchema(response: GenResponseSummary, schemas: GenComponentSchema[]): GenSchema | undefined {
  if (response.schema) return response.schema;
  // For error responses (no embedded schema), look up by name in schemas.gen.json
  if (response.name) return schemas.find((schema) => schema.name === response.name)?.schema;
  return undefined;
}

/** A response that refers to a shared error component, which the backend documents once for every route answering that status. */
const isSharedError = (response: GenResponseSummary) => response.ref?.startsWith('#/components/responses/') ?? false;

const isError = (response: GenResponseSummary) => response.status >= 400;

/** Chip of a name under a response: a body schema or a header. */
const chipClass = tw('rounded bg-muted px-1.5 py-0.5 font-mono text-foreground text-xs');

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
          <div className="link-decoration group-active/accordion-header:link-decoration-strong grow text-foreground group-hover/accordion-header:underline group-data-open/accordion-header:text-primary">
            {t('c:docs.errors')}
          </div>
          <span className="flex gap-2 font-mono text-muted-foreground text-xs max-md:hidden">
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
                    <span className="font-medium text-foreground">{response.description}</span>
                    {body && <SchemaLink schema={body} className={chipClass} />}
                    {!body && !inlineSchema && <span className="text-muted-foreground text-xs">{t('c:docs.no_response_body')}</span>}
                  </div>
                  {text && (
                    <p className="mt-0.5 max-w-measure text-foreground-soft">
                      <SpecText text={text} />
                    </p>
                  )}
                  {response.headers && <ResponseHeaders headers={response.headers} className="mt-1.5 max-w-measure" />}
                  {inlineSchema && (
                    <div className="mt-2">
                      <ViewerGroup
                        schema={inlineSchema}
                        zodCode={getZodCodeForResponse(zodIndex, operationId, response.status, response.name)}
                        typeCode={getTypeCodeForResponse(typesIndex, operationId, response.status)}
                        example={response.example}
                        descriptionToggle
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
      <div className="py-2 text-muted-foreground text-sm">{examplesOnly ? t('c:docs.no_examples_defined') : t('c:docs.no_responses_defined')}</div>
    );
  }

  return (
    <Accordion defaultValue={examplesOnly && rows.length ? [String(rows[0].status)] : undefined}>
      {rows.map((response) => {
        const schema = resolveResponseSchema(response, schemas);
        const namedBody = response.name ? schemas.find((entry) => entry.name === response.name) : undefined;
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
                <p className="max-w-measure px-3 pt-1 pb-3 text-foreground-soft">
                  <SpecText text={response.detail} />
                </p>
              )}
              {(namedBody || response.headers) && (
                <div className="flex max-w-measure flex-col gap-1.5 px-3 pt-1 pb-3">
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
                  descriptionToggle
                  renderRef={renderRef}
                />
              ) : (
                <div className="p-3 text-muted-foreground">{t('c:docs.no_response_body')}</div>
              )}
            </AccordionContent>
          </AccordionItem>
        );
      })}
      {errors.length > 0 && <ErrorsItem responses={errors} schemas={schemas} operationId={operationId} zodIndex={zodIndex} typesIndex={typesIndex} />}
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
