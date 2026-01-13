import { useSuspenseQuery } from '@tanstack/react-query';
import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import { cn } from '~/utils/cn';
import {
  getTypeCodeForRequest,
  getZodCodeForRequest,
  typesContentQueryOptions,
  zodContentQueryOptions,
} from './helpers/extract-types';
import { tagDetailsQueryOptions } from './query';
import { ViewerGroup } from './viewer-group';

interface OperationRequestProps {
  operationId: string;
  tagName: string;
}

/**
 * Collapsible container for request schema (path, query, body).
 * Only renders if the operation has a request schema.
 */
export const OperationRequest = ({ operationId, tagName }: OperationRequestProps) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(true);

  const { data: operations } = useSuspenseQuery(tagDetailsQueryOptions(tagName));
  const { data: zodContent } = useSuspenseQuery(zodContentQueryOptions);
  const { data: typesContent } = useSuspenseQuery(typesContentQueryOptions);

  const operation = operations.find((op) => op.operationId === operationId);

  const request = operation?.request;

  // Don't render if no request data
  if (!request) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-8">
      <CollapsibleTrigger className="flex items-center gap-2 group w-full text-left">
        <h4 className="text-sm font-medium">{t('common:docs.request')}</h4>
        <ChevronDownIcon
          className={cn(
            'size-4 transition-transform duration-200 opacity-40 group-hover:opacity-70',
            isOpen && 'rotate-180',
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="mt-4">
          <ViewerGroup
            schema={request}
            defaultInspectDepth={5}
            zodCode={getZodCodeForRequest(zodContent, operationId)}
            typeCode={getTypeCodeForRequest(typesContent, operationId)}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
