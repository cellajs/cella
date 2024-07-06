import { Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageNav } from '~/modules/common/page-nav';
import { SimpleHeader } from '~/modules/common/simple-header';
import { OrganizationsTableRoute, RequestsTableRoute, UsersTableRoute } from '~/routes/system';
import { FocusViewContainer } from '../common/focus-view';

const SystemPanel = () => {
  const { t } = useTranslation();

  return (
    <>
      <SimpleHeader heading={t('common:system_panel')} text={t('common:system_panel.text')} className="container pt-4 md:pt-6" />

      <PageNav
        tabs={[
          { id: 'users', label: 'users', path: UsersTableRoute.fullPath },
          { id: 'organizations', label: 'organizations', path: OrganizationsTableRoute.fullPath },
          { id: 'requests', label: 'requests', path: RequestsTableRoute.fullPath },
        ]}
      />

      <FocusViewContainer className="container mt-4">
        <Outlet />
      </FocusViewContainer>
    </>
  );
};

export default SystemPanel;
