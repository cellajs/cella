import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { HashUrlButton } from '~/modules/docs/hash-url-button';
import { OperationRequest } from '~/modules/docs/operations/operation-request';
import { OperationResponses } from '~/modules/docs/operations/operation-responses';
import type { GenOperationSummary } from '~/modules/docs/types';
import { Badge } from '~/modules/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { cn } from '~/utils/cn';
import { Spinner } from '../../common/spinner';
import { getMethodColor } from '../helpers/get-method-color';

interface OperationDetailProps {
  operation: GenOperationSummary;
  className?: string;
}

/**
 * Single operation detail with collapsible request and responses sections.
 * Displays method, path, description, request parameters, and responses.
 */
export const OperationDetail = ({ operation, className }: OperationDetailProps) => {
  const { t } = useTranslation();

  return (
    <Card id={`spy-${operation.hash}`} className={cn('border-0', className)}>
      <CardHeader className="group">
        <div className="flex justify-between items-center">
          <CardTitle className="sm:text-xl leading-8 gap-2">
            {operation.summary}
            <HashUrlButton id={operation.hash} />
          </CardTitle>
          <div className="max-sm:hidden text-sm font-mono px-2 py-0.5 text-muted-foreground shrink-0">
            {operation.id}
          </div>
        </div>
        {operation.description && (
          <CardDescription className="text-base max-w-3xl whitespace-pre-line">{operation.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 mb-4">
          <Badge
            className={`font-mono uppercase ${getMethodColor(operation.method)} bg-transparent shadow-none text-md rounded-none p-0`}
          >
            {operation.method.toUpperCase()}
          </Badge>
          <code className="sm:text-lg opacity-70 font-mono break-all">{operation.path}</code>
          {operation.deprecated && (
            <Badge variant="outline" className="text-yellow-600 border-yellow-600">
              {t('common:deprecated')}
            </Badge>
          )}
        </div>

        {/* Request (path params, query params, body) */}
        <Suspense fallback={<Spinner />}>
          <OperationRequest operationId={operation.id} tagName={operation.tags[0]} />
        </Suspense>

        {/* Responses */}
        <OperationResponses operationId={operation.id} tagName={operation.tags[0]} />
      </CardContent>
    </Card>
  );
};

interface TagOperationsListProps {
  operations: GenOperationSummary[];
}

/**
 * Renders a list of operation details and registers all operation hashes
 * with the shared scroll spy in a single hook call.
 */
export const TagOperationsList = ({ operations }: TagOperationsListProps) => {
  // Register all operation hashes for this tag section
  const sectionIds = operations.map((op) => op.hash);
  useScrollSpy(sectionIds);

  return (
    <div className="border-t">
      {operations.map((operation) => (
        <OperationDetail key={operation.hash} operation={operation} className="rounded-none last:rounded-b-lg" />
      ))}
    </div>
  );
};
