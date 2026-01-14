import { Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { PageNav } from '~/modules/common/page/nav';
import { SimpleHeader } from '~/modules/common/simple-header';

const SystemPage = () => {
  const { t } = useTranslation();

  return (
    <>
      <SimpleHeader
        heading={t('common:system_panel')}
        text={t('common:system_panel.text')}
        className="pt-4 md:pt-6 md:px-6"
      />

      <PageNav
        className="mt-4"
        tabs={[
          { id: 'users', label: 'common:users', path: '/system/users' },
          { id: 'organizations', label: 'common:organizations', path: '/system/organizations' },
          { id: 'requests', label: 'common:requests', path: '/system/requests' },
          { id: 'metrics', label: 'common:metrics', path: '/system/metrics' },
        ]}
      />

      <FocusViewContainer className="container min-h-screen">
        <Outlet />
      </FocusViewContainer>
    </>
  );
};

export default SystemPage;
