import { useTranslation } from 'react-i18next';
import { SimpleHeader } from '~/modules/common/simple-header';
import { OpenApiSpecViewer } from './openapi-spec-viewer';
import { OverviewTable } from './overview-table';

function OverviewPage() {
  const { t } = useTranslation();

  return (
    <div className="container">
      <SimpleHeader className="mt-6 mb-8" heading={t('c:docs.openapi_specification')} />
      <OverviewTable />
      <OpenApiSpecViewer />
    </div>
  );
}

export { OverviewPage };
