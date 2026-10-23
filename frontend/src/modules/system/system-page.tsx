import { getRouteApi, Outlet } from '@tanstack/react-router';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { SlotTabHost } from '~/modules/common/page/slot-tab-host';
import { PageTabNav } from '~/modules/common/page/tab-nav';
import { ScrollReset } from '~/modules/common/scroll-reset';
import { SimpleHeader } from '~/modules/common/simple-header';

const systemToolApi = getRouteApi('/_app/system/$tool');

export function SystemPage() {
  return (
    <>
      <div className="container">
        <SimpleHeader heading="c:system_panel" text="c:system_panel.text" className="py-4 md:pt-6" />
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

/** Renders a registry tab tool for the system panel: the `system.tabs` slot's `$tool` host. */
export function SystemToolComponent() {
  const { tool } = systemToolApi.useParams();
  return <SlotTabHost slot="system.tabs" toolId={tool} context={undefined} />;
}
