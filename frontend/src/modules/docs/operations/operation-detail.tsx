import { useSuspenseQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import i18n from 'i18next';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { GenOperationDetail, GenOperationSummary } from 'sdk/docs-types';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { HashUrlButton } from '~/modules/common/hash-url-button';
import { HighlightText } from '~/modules/common/match-highlight/highlight-text';
import { Spinner } from '~/modules/common/spinner';
import { getTypeCodeForRequest, getZodCodeForRequest } from '~/modules/docs/helpers/extract-types';
import { operationLinkOptions } from '~/modules/docs/helpers/reference-links';
import { upperFirst } from '~/modules/docs/helpers/upper-first';
import { openDocsSheet } from '~/modules/docs/open-docs-sheet';
import { MethodLabel } from '~/modules/docs/operations/method-label';
import { OperationAccess } from '~/modules/docs/operations/operation-access';
import { OperationResponses } from '~/modules/docs/operations/operation-responses';
import { OperationSection } from '~/modules/docs/operations/operation-section';
import { SwitchedOffBadge } from '~/modules/docs/operations/switched-off-badge';
import { tagDetailsQueryOptions, useDefinitionIndexes } from '~/modules/docs/query';
import { useSchemaRefLink } from '~/modules/docs/schemas/schema-detail';
import { SpecText } from '~/modules/docs/spec-text';
import { ViewerGroup } from '~/modules/docs/viewer-group';
import { Badge } from '~/modules/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { cn } from '~/utils/cn';

export const openOperationSheet = (operation: GenOperationSummary, trigger: HTMLButtonElement | HTMLAnchorElement) =>
  openDocsSheet({
    id: `operation-${operation.id}`,
    title: i18n.t('c:docs.operation_detail'),
    trigger,
    content: <OperationDetail operation={operation} />,
  });

function OperationRequest({ detail }: { detail?: GenOperationDetail }) {
  const { t } = useTranslation();
  const { zodIndex, typesIndex } = useDefinitionIndexes();
  const renderRef = useSchemaRefLink();

  if (!detail?.request) return null;

  const { example, ...format } = detail.request;

  return (
    <OperationSection title={t('c:docs.request')}>
      <div className="mt-2">
        <ViewerGroup
          schema={format}
          zodCode={getZodCodeForRequest(zodIndex, detail.operationId)}
          typeCode={getTypeCodeForRequest(typesIndex, detail.operationId)}
          example={example}
          renderRef={renderRef}
        />
      </div>
    </OperationSection>
  );
}

interface OperationDetailProps {
  operation: GenOperationSummary;
  detail?: GenOperationDetail;
  className?: string;
}

function OperationDetail({ operation, detail: detailProp, className }: OperationDetailProps) {
  const { t } = useTranslation();
  const { data: tagDetails } = useSuspenseQuery(tagDetailsQueryOptions(operation.tags[0] ?? ''));
  const detail = detailProp ?? tagDetails.find((entry) => entry.operationId === operation.id);
  const { href } = useRouter().buildLocation(operationLinkOptions(operation));
  // Every OpenAPI tag by kind, as a bare value such as `product` says little alone. The owner comes last: most operations share it.
  const kinds = Object.entries(operation.tagsByKind).toSorted(([a], [b]) => Number(a === 'owner') - Number(b === 'owner'));

  return (
    <Card id={`spy-${operation.hash}`} className={cn('border-0 sm:py-5', className)}>
      <CardHeader className="group/hash-url">
        <div className="flex items-center justify-between">
          <CardTitle level={3} className="gap-2 leading-8 sm:text-xl">
            <HighlightText text={operation.summary} />
            <HashUrlButton hash={operation.hash} href={href} />
          </CardTitle>
          <div className="text-muted-foreground shrink-0 px-2 py-0.5 font-mono text-sm max-sm:hidden">
            <HighlightText text={operation.id} />
          </div>
        </div>
        {operation.description && (
          <CardDescription className="max-w-measure text-base whitespace-pre-line">
            <SpecText text={operation.description} />
          </CardDescription>
        )}
        {kinds.length > 0 && (
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {kinds.map(([kind, values]) => (
              <div key={kind}>
                <dt className="text-muted-foreground inline">{upperFirst(kind)}</dt>
                <dd className="inline">
                  {' '}
                  <HighlightText text={values.join(', ')} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center gap-4 max-sm:flex-col max-sm:items-start max-sm:gap-1">
          <MethodLabel method={operation.method} size="md" />
          <code className="text-muted-foreground break-all sm:text-lg">
            <HighlightText text={operation.path} />
          </code>
          {operation.deprecated && (
            <Badge variant="outline" className="border-warning text-warning">
              {t('c:deprecated')}
            </Badge>
          )}
          <SwitchedOffBadge enabledBy={operation.enabledBy} withReason />
        </div>

        <OperationAccess operation={operation} />

        <Suspense fallback={<Spinner />}>
          <OperationRequest detail={detail} />
        </Suspense>

        <OperationResponses detail={detail} />
      </CardContent>
    </Card>
  );
}

/** Fetches tag details once (not per-child) and registers all operation hashes with the scroll spy. */
export function TagOperationsList({ operations, tagName }: { operations: GenOperationSummary[]; tagName: string }) {
  const sectionIds = operations.map((op) => op.hash);
  useScrollSpy(sectionIds);

  const { data: tagDetails } = useSuspenseQuery(tagDetailsQueryOptions(tagName));
  const detailsById = new Map(tagDetails.map((detail) => [detail.operationId, detail]));

  return (
    <div>
      {operations.map((operation) => (
        <OperationDetail
          key={operation.hash}
          operation={operation}
          detail={detailsById.get(operation.id)}
          className="border-input rounded-none border-t border-dashed last:rounded-b-lg"
        />
      ))}
    </div>
  );
}
