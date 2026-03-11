import { Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { PageTabNav } from '~/modules/common/page/tab-nav';
import { ScrollReset } from '~/modules/common/scroll-reset';
import { SimpleHeader } from '~/modules/common/simple-header';
import { SystemRoute } from '~/routes/system-routes';

export function SystemPage() {
  const { t } = useTranslation();

  return (
    <>
      <div className="container">
        <SimpleHeader
          heading={t('common:system_panel')}
          text={t('common:system_panel.text')}
          className="py-4 md:pt-6"
        />
      </div>

      <ScrollReset>
        <PageTabNav parentRouteId={SystemRoute.id} />
        <FocusViewContainer>
          <Outlet />
        </FocusViewContainer>
      </ScrollReset>
    </>
  );
}
