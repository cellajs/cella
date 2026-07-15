import { useSuspenseQuery } from '@tanstack/react-query';
import i18n from 'i18next';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { HashUrlButton } from '~/modules/common/hash-url-button';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { OperationRequest } from '~/modules/docs/operations/operation-request';
import { OperationResponses } from '~/modules/docs/operations/operation-responses';
import type { GenOperationDetail, GenOperationSummary } from '~/modules/docs/types';
import { Badge } from '~/modules/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { cn } from '~/utils/cn';
import { Spinner } from '../../common/spinner';
import { getHashUrl } from '../hash-url';
import { getMethodColor } from '../helpers/get-method-color';
import { tagDetailsQueryOptions } from '../query';

/**
 * Opens a sheet with operation detail view.
 */
export function openOperationSheet(operation: GenOperationSummary, trigger: HTMLButtonElement | HTMLAnchorElement) {
  useSheeter.getState().create(
    <Suspense fallback={<Spinner className="mt-[40vh]" />}>
      <div className="container pt-3 pb-[50vh]">
        <OperationDetail operation={operation} />
      </div>
    </Suspense>,
    {
      id: `operation-${operation.id}`,
      triggerRef: { current: trigger },
      side: 'right',
      className: 'max-w-full lg:max-w-4xl',
      title: i18n.t('c:docs.operation_detail'),
    },
  );
}

function useResolvedDetail(operation: GenOperationSummary, detail?: GenOperationDetail) {
  const tagName = operation.tags[0] ?? '';
  const { data: tagDetails } = useSuspenseQuery(tagDetailsQueryOptions(tagName));
  if (detail) return detail;
  return tagDetails?.find((d) => d.operationId === operation.id);
}

interface OperationDetailProps {
  operation: GenOperationSummary;
  detail?: GenOperationDetail;
  className?: string;
}

/**
 * Single operation detail with collapsible request and responses sections.
 * Displays method, path, description, request parameters, and responses.
 */
export const OperationDetail = ({ operation, detail: detailProp, className }: OperationDetailProps) => {
  const { t } = useTranslation();
  const detail = useResolvedDetail(operation, detailProp);

  return (
    <Card id={`spy-${operation.hash}`} className={cn('border-0', className)}>
      <CardHeader className="group">
        <div className="flex items-center justify-between">
          <CardTitle className="gap-2 leading-8 sm:text-xl">
            {operation.summary}
            <HashUrlButton url={getHashUrl(operation.hash)} />
          </CardTitle>
          <div className="shrink-0 px-2 py-0.5 font-mono text-muted-foreground text-sm max-sm:hidden">
            {operation.id}
          </div>
        </div>
        {operation.description && (
          <CardDescription className="max-w-3xl whitespace-pre-line text-base">{operation.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center gap-4 max-sm:flex-col max-sm:items-start max-sm:gap-1">
          <Badge
            className={`font-mono uppercase ${getMethodColor(operation.method)} rounded-none bg-transparent p-0 text-md shadow-none`}
          >
            {operation.method.toUpperCase()}
          </Badge>
          <code className="break-all font-mono opacity-70 sm:text-lg">{operation.path}</code>
          {operation.deprecated && (
            <Badge variant="outline" className="border-yellow-600 text-yellow-600">
              {t('c:deprecated')}
            </Badge>
          )}
        </div>

        {/* Request (path params, query params, body) */}
        <Suspense fallback={<Spinner />}>
          <OperationRequest detail={detail} />
        </Suspense>

        {/* Responses */}
        <OperationResponses detail={detail} />
      </CardContent>
    </Card>
  );
};

interface TagOperationsListProps {
  operations: GenOperationSummary[];
}

/** Fetches tag details once (not per-child) and registers all operation hashes with the scroll spy. */
export const TagOperationsList = ({ operations }: TagOperationsListProps) => {
  // Register all operation hashes for this tag section
  const sectionIds = operations.map((op) => op.hash);
  useScrollSpy(sectionIds);

  // Fetch tag details once and build a lookup map
  const tagName = operations.length > 0 ? operations[0].tags[0] : '';
  const { data: tagDetails } = useSuspenseQuery(tagDetailsQueryOptions(tagName));
  const detailsMap = new Map(tagDetails.map((d) => [d.operationId, d]));

  // Guard against empty operations to prevent fetching with undefined tag name
  if (operations.length === 0) return null;

  return (
    <div className="border-t border-dashed">
      {operations.map((operation) => (
        <OperationDetail
          key={operation.hash}
          operation={operation}
          detail={detailsMap.get(operation.id)}
          className="rounded-none last:rounded-b-lg"
        />
      ))}
    </div>
  );
};
