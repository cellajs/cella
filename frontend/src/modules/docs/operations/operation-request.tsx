import { useSuspenseQuery } from '@tanstack/react-query';
import { ChevronDownIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import {
  getTypeCodeForRequest,
  getZodCodeForRequest,
  typesIndexQueryOptions,
  zodIndexQueryOptions,
} from '../helpers/extract-types';
import type { GenOperationDetail } from '../types';
import { ViewerGroup } from '../viewer-group';

interface OperationRequestProps {
  detail?: GenOperationDetail;
}

/**
 * Collapsible container for request schema (path, query, body).
 * Only renders if the operation has a request schema.
 */
export const OperationRequest = ({ detail }: OperationRequestProps) => {
  const { t } = useTranslation();

  const { data: zodIndex } = useSuspenseQuery(zodIndexQueryOptions);
  const { data: typesIndex } = useSuspenseQuery(typesIndexQueryOptions);

  const request = detail?.request;

  // Don't render if no request data
  if (!request) return null;

  return (
    <Collapsible defaultOpen className="mt-8">
      <CollapsibleTrigger
        nativeButton
        render={
          <Button variant="ghost" size="sm" className="group w-full justify-start gap-2">
            <span className="font-medium text-sm">{t('c:docs.request')}</span>
            <ChevronDownIcon className="size-4 opacity-40 transition-transform duration-200 group-hover:opacity-70 group-data-panel-open:rotate-180" />
          </Button>
        }
      />
      <CollapsibleContent className="overflow-hidden data-closed:animate-collapsible-up data-open:animate-collapsible-down">
        <div className="mt-4">
          <ViewerGroup
            schema={request}
            defaultInspectDepth={5}
            zodCode={getZodCodeForRequest(zodIndex, detail.operationId)}
            typeCode={getTypeCodeForRequest(typesIndex, detail.operationId)}
            example={request.example}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
