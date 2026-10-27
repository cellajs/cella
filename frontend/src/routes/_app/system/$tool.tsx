import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { SystemToolComponent } from '~/modules/system/system-page';
import { createErrorComponent } from '~/routes/-route-utils';
import { pageHead } from '~/utils/app-title';

/** Any `system.tabs` id without a static sibling route resolves here and renders the matching registry tool. */
export const Route = createFileRoute('/_app/system/$tool')({
  staticData: { isAuth: true },
  head: () => pageHead(i18n.t('c:system_panel')),
  component: SystemToolComponent,
  errorComponent: createErrorComponent('app'),
});
