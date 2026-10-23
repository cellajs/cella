import { useTranslation } from 'react-i18next';
import { DocsPageHeader } from '~/modules/docs/docs-page-header';
import { OpenApiSpecViewer } from '~/modules/docs/openapi-spec-viewer';
import { OverviewTable } from '~/modules/docs/overview-table';

export function OverviewPage() {
  const { t } = useTranslation();

  return (
    <div className="container">
      <DocsPageHeader title={t('c:docs.openapi_specification')} className="pb-8" />
      <OverviewTable />
      <OpenApiSpecViewer />
    </div>
  );
}
