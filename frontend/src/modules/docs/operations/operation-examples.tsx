import { useSuspenseQuery } from '@tanstack/react-query';
import i18n from 'i18next';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { GenOperationSummary } from 'sdk/docs-types';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { Spinner } from '~/modules/common/spinner';
import { typesIndexQueryOptions, zodIndexQueryOptions } from '../helpers/extract-types';
import { schemasQueryOptions, tagDetailsQueryOptions } from '../query';
import { ResponsesAccordion } from './operation-responses';

interface OperationExamplesProps {
  operationId: string;
  tagName: string;
}

export function openExamplesSheet(operation: GenOperationSummary, trigger: HTMLButtonElement | HTMLAnchorElement) {
  useSheeter.getState().create(
    <Suspense fallback={<Spinner className="mt-[40vh]" />}>
      <div className="container pt-3 pb-[50vh]">
        <OperationExamples operationId={operation.id} tagName={operation.tags[0]} />
      </div>
    </Suspense>,
    {
      id: `examples-${operation.id}`,
      triggerRef: { current: trigger },
      side: 'right',
      className: 'max-w-full lg:max-w-4xl',
      title: i18n.t('c:docs.success_response'),
    },
  );
}

/** Wrap the parent component in a Suspense boundary for optimal batching. */
export function OperationExamples({ operationId, tagName }: OperationExamplesProps) {
  const { t } = useTranslation();

  const { data: operations } = useSuspenseQuery(tagDetailsQueryOptions(tagName));
  const { data: schemas } = useSuspenseQuery(schemasQueryOptions);
  const { data: zodIndex } = useSuspenseQuery(zodIndexQueryOptions);
  const { data: typesIndex } = useSuspenseQuery(typesIndexQueryOptions);

  const operation = operations.find((op) => op.operationId === operationId);
  const responses = operation?.responses ?? [];

  const successResponsesWithExamples = responses.filter(
    (r) => r.status >= 200 && r.status < 300 && r.example !== undefined,
  );

  if (successResponsesWithExamples.length === 0) {
    return <div className="py-4 text-center text-muted-foreground">{t('c:docs.no_examples_defined')}</div>;
  }

  return (
    <ResponsesAccordion
      examplesOnly
      responses={responses}
      schemas={schemas}
      operationId={operationId}
      zodIndex={zodIndex}
      typesIndex={typesIndex}
    />
  );
}
