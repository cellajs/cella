import { t } from 'i18next';
import { InfoIcon } from 'lucide-react';
import { appConfig } from 'shared';
import type { AlertBanner } from '~/modules/common/alerter/alert-banner';

const alerts: AlertBanner[] = [];

// Explain how to sign in using test account
if (appConfig.mode === 'development') {
  alerts.push({
    id: 'test-credentials',
    modes: ['public'],
    icon: InfoIcon,
    className: 'rounded-none border-0 border-t z-10 fixed bottom-0 left-0 right-0',
    children: (
      <>
        <strong className="mr-2">Testing credentials</strong>
        <p>Hi there! New developer? Welcome to Cella! Sign in using ADMIN_EMAIL using a magic link or OAuth.</p>
      </>
    ),
  });
}

// In production mode, show a notice that the app is a pre-release version
if (appConfig.mode === 'production') {
  alerts.push({
    id: 'prerelease',
    modes: ['app'],
    icon: InfoIcon,
    className: 'rounded-none border-0 border-b',
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
