import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GenOperationSummary } from '~/api.gen/docs';
import { DescriptionEditor } from '~/modules/docs/description-editor';
import { HashUrlButton } from '~/modules/docs/hash-url-button';
import { OperationRequest } from '~/modules/docs/operation-request';
import { OperationResponses } from '~/modules/docs/operation-responses';
import { Badge } from '~/modules/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import { cn } from '~/utils/cn';
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
  const [isRequestOpen, setIsRequestOpen] = useState(true);
  const [isResponsesOpen, setIsResponsesOpen] = useState(true);

  return (
    <Card id={operation.hash} className="scroll-mt-10 sm:scroll-mt-2 border-0">
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
        <CardDescription className="flex items-center gap-3 my-2">
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
        </CardDescription>
      </CardHeader>
      <CardContent>
        {operation.description && (
          <div className="pb-3">
            <DescriptionEditor operationId={operation.id} initialDescription={operation.description} />
          </div>
        )}

        {/* Request (path params, query params, body) */}
        <OperationRequest
          operationId={operation.id}
          tagName={operation.tags[0]}
          isOpen={isRequestOpen}
          onOpenChange={setIsRequestOpen}
        />

        {/* Responses */}
        <Collapsible open={isResponsesOpen} onOpenChange={setIsResponsesOpen} className="mt-8">
          <CollapsibleTrigger className="flex items-center gap-2 group w-full text-left">
            <h4 className="text-sm font-medium">{t('common:docs.responses')}</h4>
            <ChevronDownIcon
              className={cn(
                'size-4 transition-transform duration-200 opacity-40 group-hover:opacity-70',
                isResponsesOpen && 'rotate-180',
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
            <div className="mt-2">
              <OperationResponses
                operationId={operation.id}
                tagName={operation.tags[0]}
                onResponseOpen={() => setIsRequestOpen(false)}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
};
