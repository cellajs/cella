import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { OrganizationSettingsComponent } from '~/modules/organization/route-components';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_app/$tenantId/$organizationSlug/organization/settings')({
  // locked: the tabs arrangement card writes tab hiding; the settings tab itself must stay reachable
  staticData: { navTab: { id: 'settings', label: 'c:settings', description: 'c:tab_settings.text', requires: 'update', locked: true } },
  head: ({ match }) => pageHead(`${i18n.t('c:settings')} · ${match.context.organization?.name}`),
  component: OrganizationSettingsComponent,
});
