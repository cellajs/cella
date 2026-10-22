import { useSuspenseQuery } from '@tanstack/react-query';
import i18n from 'i18next';
import type { GenOperationSummary } from 'sdk/docs-types';
import { openOperationDocSheet } from '~/modules/docs/operations/operation-detail';
import { ResponsesAccordion } from '~/modules/docs/operations/operation-responses';
import { schemasQueryOptions, tagDetailsQueryOptions, useDefinitionIndexes } from '~/modules/docs/query';

interface OperationExamplesProps {
  operationId: string;
  tagName: string;
}

export function openExamplesSheet(operation: GenOperationSummary, trigger: HTMLButtonElement | HTMLAnchorElement) {
  openOperationDocSheet({
    id: `examples-${operation.id}`,
    title: i18n.t('c:docs.success_response'),
    trigger,
    content: <OperationExamples operationId={operation.id} tagName={operation.tags[0]} />,
  });
}

/** Wrap the parent component in a Suspense boundary for optimal batching. */
export function OperationExamples({ operationId, tagName }: OperationExamplesProps) {
  const { data: tagDetails } = useSuspenseQuery(tagDetailsQueryOptions(tagName));
  const { data: schemas } = useSuspenseQuery(schemasQueryOptions);
  const { zodIndex, typesIndex } = useDefinitionIndexes();

  const detail = tagDetails.find((entry) => entry.operationId === operationId);
  // The sheet is titled "Success response": error examples stay on the operation page.
  const successResponses = (detail?.responses ?? []).filter((response) => response.status >= 200 && response.status < 300);

  return (
    <ResponsesAccordion
      examplesOnly
      responses={successResponses}
      schemas={schemas}
      operationId={operationId}
      zodIndex={zodIndex}
      typesIndex={typesIndex}
    />
  );
}
