import { Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { PageTabNav } from '~/modules/common/page/tab-nav';
import { SimpleHeader } from '~/modules/common/simple-header';
import { SystemRoute } from '~/routes/system-routes';

function SystemPage() {
  const { t } = useTranslation();

  return (
    <>
      <div className="container">
        <SimpleHeader
          heading={t('common:system_panel')}
          text={t('common:system_panel.text')}
          className="pt-4 md:pt-6"
        />
      </div>

      <PageTabNav className="mt-4" parentRouteId={SystemRoute.id} />

      <FocusViewContainer className="container min-h-screen">
        <Outlet />
      </FocusViewContainer>
    </>
  );
}

export default SystemPage;
