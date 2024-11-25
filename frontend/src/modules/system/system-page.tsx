import { Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { PageNav } from '~/modules/common/page-nav';
import { SimpleHeader } from '~/modules/common/simple-header';
import { MetricsRoute, OrganizationsTableRoute, RequestsTableRoute, UsersTableRoute } from '~/routes/system';

const SystemPage = () => {
  const { t } = useTranslation();

  return (
    <>
      <SimpleHeader heading={t('common:system_panel')} text={t('common:system_panel.text')} className="container pt-4 md:pt-6" />

      <PageNav
        className="mt-4"
        tabs={[
          { id: 'users', label: 'common:users', path: UsersTableRoute.fullPath },
          { id: 'organizations', label: 'common:organizations', path: OrganizationsTableRoute.fullPath },
          { id: 'requests', label: 'common:requests', path: RequestsTableRoute.fullPath },
          { id: 'metrics', label: 'common:metrics', path: MetricsRoute.fullPath },
        ]}
      />

      <FocusViewContainer className="container mt-4">
        <Outlet />
      </FocusViewContainer>
    </>
  );
};

export default SystemPage;
