import { useTranslation } from 'react-i18next';
import type { GenOperationDetail } from 'sdk/docs-types';
import { getTypeCodeForRequest, getZodCodeForRequest } from '~/modules/docs/helpers/extract-types';
import { OperationSection } from '~/modules/docs/operations/operation-section';
import { useDefinitionIndexes } from '~/modules/docs/query';
import { ViewerGroup } from '~/modules/docs/viewer-group';

interface OperationRequestProps {
  detail?: GenOperationDetail;
}

export function OperationRequest({ detail }: OperationRequestProps) {
  const { t } = useTranslation();
  const { zodIndex, typesIndex } = useDefinitionIndexes();

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
          descriptionToggle
        />
      </div>
    </OperationSection>
  );
}
