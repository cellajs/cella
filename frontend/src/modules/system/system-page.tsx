import { Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { PageTabNav } from '~/modules/common/page/tab-nav';
import { ScrollReset } from '~/modules/common/scroll-reset';
import { SimpleHeader } from '~/modules/common/simple-header';

export function SystemPage() {
  const { t } = useTranslation();

  return (
    <>
      <div className="container">
        <SimpleHeader heading={t('c:system_panel')} text={t('c:system_panel.text')} className="py-4 md:pt-6" />
      </div>

      <ScrollReset>
        <PageTabNav parentRouteId="/_app/system" />
        <FocusViewContainer>
          <Outlet />
        </FocusViewContainer>
      </ScrollReset>
    </>
  );
}
