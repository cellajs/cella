import { useTranslation } from 'react-i18next';
import { SimpleHeader } from '~/modules/common/simple-header';
import OpenApiSpecViewer from './openapi-spec-viewer';
import OverviewTable from './overview-table';

/**
 * Overview page component displaying OpenAPI specification details.
 */
function OverviewPage() {
  const { t } = useTranslation();

  return (
    <div className="container">
      <SimpleHeader className="mb-8" heading={t('common:docs.openapi_specification')} />
      <OverviewTable />
      <OpenApiSpecViewer />
    </div>
  );
}

export default OverviewPage;
