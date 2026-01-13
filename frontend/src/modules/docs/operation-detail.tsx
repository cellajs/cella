import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { DescriptionEditor } from '~/modules/docs/description-editor';
import { HashUrlButton } from '~/modules/docs/hash-url-button';
import { OperationRequest } from '~/modules/docs/operation-request';
import { OperationResponses } from '~/modules/docs/operation-responses';
import type { GenOperationSummary } from '~/modules/docs/types';
import { Badge } from '~/modules/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import Spinner from '../common/spinner';
import { getMethodColor } from './helpers/get-method-color';

interface OperationDetailProps {
  operation: GenOperationSummary;
}

/**
 * Single operation detail with collapsible request and responses sections.
 * Displays method, path, description, request parameters, and responses.
 */
export const OperationDetail = ({ operation }: OperationDetailProps) => {
  const { t } = useTranslation();

  return (
    <Card id={operation.hash} className="scroll-mt-14 sm:scroll-mt-2 border-0">
      <CardHeader className="group">
        <div className="flex justify-between items-start">
          <CardTitle className="text-xl leading-8 gap-2">
            {operation.summary}
            <HashUrlButton id={operation.hash} />
          </CardTitle>
          <div className="max-sm:hidden text-sm font-mono px-2 py-0.5 text-muted-foreground shrink-0">
            {operation.id}
          </div>
        </div>
        {operation.description && (
          <CardDescription className="flex items-center gap-3 my-2 text-base max-w-3xl">
            <DescriptionEditor operationId={operation.id} initialDescription={operation.description} />
          </CardDescription>
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
