import { useSuspenseQuery } from '@tanstack/react-query';
import i18n from 'i18next';
import { type ReactNode, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { GenOperationDetail, GenOperationSummary } from 'sdk/docs-types';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { HashUrlButton } from '~/modules/common/hash-url-button';
import { HighlightText } from '~/modules/common/match-highlight/highlight-text';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { Spinner } from '~/modules/common/spinner';
import { upperFirst } from '~/modules/docs/helpers/upper-first';
import { MethodLabel } from '~/modules/docs/operations/method-label';
import { OperationAccess } from '~/modules/docs/operations/operation-access';
import { OperationRequest } from '~/modules/docs/operations/operation-request';
import { OperationResponses } from '~/modules/docs/operations/operation-responses';
import { SwitchedOffBadge } from '~/modules/docs/operations/switched-off-badge';
import { tagDetailsQueryOptions } from '~/modules/docs/query';
import { Badge } from '~/modules/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { cn } from '~/utils/cn';

interface OperationDocSheetOptions {
  id: string;
  title: string;
  trigger: HTMLButtonElement | HTMLAnchorElement;
  content: ReactNode;
}

/** Opens operation docs in a right-hand sheet, with a spinner while the content suspends. */
export function openOperationDocSheet({ id, title, trigger, content }: OperationDocSheetOptions) {
  sheeter.getState().create(
    <Suspense fallback={<Spinner size="lg" className="mt-[40vh]" />}>
      <div className="container pt-3 pb-[50vh]">{content}</div>
    </Suspense>,
    { id, title, triggerRef: { current: trigger }, side: 'right' },
  );
}

export function openOperationSheet(operation: GenOperationSummary, trigger: HTMLButtonElement | HTMLAnchorElement) {
  openOperationDocSheet({
    id: `operation-${operation.id}`,
    title: i18n.t('c:docs.operation_detail'),
    trigger,
    content: <OperationDetail operation={operation} />,
  });
}

function useResolvedDetail(operation: GenOperationSummary, detail?: GenOperationDetail) {
  const tagName = operation.tags[0] ?? '';
  const { data: tagDetails } = useSuspenseQuery(tagDetailsQueryOptions(tagName));
  if (detail) return detail;
  return tagDetails.find((entry) => entry.operationId === operation.id);
}

/** Every OpenAPI tag by kind, as a bare value such as `product` says little alone. The owner comes last: most operations share it. */
function OperationTags({ tagsByKind }: Pick<GenOperationSummary, 'tagsByKind'>) {
  const kinds = Object.entries(tagsByKind).toSorted(([a], [b]) => Number(a === 'owner') - Number(b === 'owner'));
  if (!kinds.length) return null;

  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {kinds.map(([kind, values]) => (
        <div key={kind}>
          <dt className="inline text-muted-foreground">{upperFirst(kind)}</dt>
          <dd className="inline">
            {' '}
            <HighlightText text={values.join(', ')} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface OperationDetailProps {
  operation: GenOperationSummary;
  detail?: GenOperationDetail;
  className?: string;
}

function OperationDetail({ operation, detail: detailProp, className }: OperationDetailProps) {
  const { t } = useTranslation();
  const detail = useResolvedDetail(operation, detailProp);

  return (
    <Card id={`spy-${operation.hash}`} className={cn('border-0 sm:py-5', className)}>
      <CardHeader className="group/hash-url">
        <div className="flex items-center justify-between">
          <CardTitle level={3} className="gap-2 leading-8 sm:text-xl">
            <HighlightText text={operation.summary} />
            <HashUrlButton hash={operation.hash} />
          </CardTitle>
          <div className="shrink-0 px-2 py-0.5 font-mono text-muted-foreground text-sm max-sm:hidden">
            <HighlightText text={operation.id} />
          </div>
        </div>
        {operation.description && (
          <CardDescription className="max-w-measure whitespace-pre-line text-base">
            <HighlightText text={operation.description} />
          </CardDescription>
        )}
        <OperationTags tagsByKind={operation.tagsByKind} />
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center gap-4 max-sm:flex-col max-sm:items-start max-sm:gap-1">
          <MethodLabel method={operation.method} size="md" />
          <code className="break-all text-muted-foreground sm:text-lg">
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

interface TagOperationsListProps {
  operations: GenOperationSummary[];
  tagName: string;
}

/** Fetches tag details once (not per-child) and registers all operation hashes with the scroll spy. */
export function TagOperationsList({ operations, tagName }: TagOperationsListProps) {
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
          className="rounded-none border-input border-t border-dashed last:rounded-b-lg"
        />
      ))}
    </div>
  );
}
