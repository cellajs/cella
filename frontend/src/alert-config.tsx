import { t } from 'i18next';
import { InfoIcon } from 'lucide-react';
import { appConfig } from 'shared';
import type { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { tw } from '~/utils/tw';

const alerts: AlertBanner[] = [];

// Explain how to sign in using test account
if (appConfig.mode === 'development') {
  alerts.push({
    id: 'test-credentials',
    modes: ['public'],
    icon: InfoIcon,
    className: tw('fixed inset-x-0 bottom-0 z-40 rounded-none border-0 border-t'),
    children: (
      <>
        <strong className="mr-2">Sign in as the seeded admin</strong>
        <p>Use the ADMIN_EMAIL address in .env at the repo root. The magic link is printed in the terminal running pnpm dev.</p>
      </>
    ),
  });
}

if (appConfig.mode === 'production') {
  alerts.push({
    id: 'prerelease',
    modes: ['app'],
    icon: InfoIcon,
    className: tw('rounded-none border-0 border-b'),
    children: (
      <>
        <strong className="mr-2">{t('about:prerelease')}</strong>
        {t('c:experiment_notice.text')}
      </>
    ),
  });
}

// Here you can set app-specific global alerts
export const alertsConfig = alerts;
