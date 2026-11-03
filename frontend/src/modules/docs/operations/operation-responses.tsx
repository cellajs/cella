import { useSuspenseQuery } from '@tanstack/react-query';
import { PanelTopIcon } from 'lucide-react';
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
import { Alert, AlertDescription } from '~/modules/ui/alert';
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

/** "Body" and a link to the named schema of a response body. */
function ResponseBody({ schema, className }: { schema: GenComponentSchema; className?: string }) {
  const { t } = useTranslation();

  return (
    <p className={cn('flex items-center gap-2 px-3 text-muted-foreground', className)}>
      {t('c:docs.body')}
      <SchemaLink schema={schema} className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground text-xs" />
    </p>
  );
}

interface SharedErrorsItemProps {
  responses: GenResponseSummary[];
  schemas: GenComponentSchema[];
}

/** One row for the shared errors: each status with its label and text, and a link to the body they all extend. */
function SharedErrorsItem({ responses, schemas }: SharedErrorsItemProps) {
  const { t } = useTranslation();

  const errorSchemas = responses.map((response) => schemas.find((schema) => schema.name === response.name));
  const statusClasses = new Set(responses.map((response) => Math.floor(response.status / 100)));
  const baseRefs = new Set(errorSchemas.map((schema) => schema?.extendsRef));
  const [baseRef] = baseRefs;
  const body = baseRefs.size === 1 ? schemas.find((schema) => schema.ref === baseRef) : undefined;

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
          {responses.map((response, index) => (
            <div key={response.status} className="flex items-start gap-3">
              <dt className={cn(statusBadgeClass, getStatusColor(response.status))}>{response.status}</dt>
              <dd className="max-w-measure">
                <div className="font-medium text-foreground">{response.description}</div>
                {errorSchemas[index]?.description && (
                  <p className="mt-0.5 text-foreground-soft">
                    <SpecText text={errorSchemas[index].description} />
                  </p>
                )}
                {response.headers?.map((header) => (
                  <div key={header.name} className="mt-1.5 flex items-start gap-2 text-foreground-soft">
                    <PanelTopIcon className="mt-0.5 size-4 shrink-0 text-info" />
                    <span>
                      <span className="font-mono text-foreground">{header.name}</span> <SpecText text={header.description} />
                    </span>
                  </div>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        {body && <ResponseBody schema={body} className="mt-4 border-t pt-3" />}
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
  const rows = responses.filter((response) => !isSharedError(response));
  const sharedErrors = responses.filter(isSharedError);

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
              {/* A link cannot sit in the trigger button, so the body's schema link leads the panel */}
              {namedBody && <ResponseBody schema={namedBody} className="pt-1 pb-3" />}
              {response.headers && (
                // px-3 and leading-normal match the viewer below; a note, since an alert role announces on every opening of the panel
                <Alert variant="info" role="note" className="mb-2 px-3">
                  <PanelTopIcon />
                  <AlertDescription>
                    <dl className="w-full divide-y divide-foreground/10 leading-normal">
                      {response.headers.map((header) => (
                        <div key={header.name} className="flex justify-between gap-x-6 py-1.5 first:pt-0 last:pb-0 max-sm:flex-col">
                          <dt className="shrink-0 font-mono text-foreground">{header.name}</dt>
                          <dd className="sm:text-right">
                            <SpecText text={header.description} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </AlertDescription>
                </Alert>
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
      {sharedErrors.length > 0 && <SharedErrorsItem responses={sharedErrors} schemas={schemas} />}
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
