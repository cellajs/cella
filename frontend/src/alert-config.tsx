import { config } from 'config';
import { t } from 'i18next';
import { Info } from 'lucide-react';
import type { AlertWrap } from '~/modules/common/alert-wrap';

const alerts: AlertWrap[] = [];

// Explain how to sign in using test account
if (config.mode === 'development') {
  alerts.push({
    id: 'test-credentials',
    modes: ['public'],
    Icon: Info,
    className: 'rounded-none border-0 border-t z-10 fixed bottom-0 left-0 right-0',
    children: (
      <>
        <strong className="mr-2">Testing credentials</strong>
        <p>
          Hi there! New developer? Welcome to Cella! Sign in using <strong>admin-test@cellajs.com</strong> and password <strong>12345678</strong>.
        </p>
      </>
    ),
  });
}

// In production mode, show a notice that the app is a pre-release version
if (config.mode === 'production') {
  alerts.push({
    id: 'prerelease',
    modes: ['app'],
    Icon: Info,
    className: 'rounded-none border-0 border-b',
    children: (
      <>
        <strong className="mr-2">{t('about:prerelease')}</strong>
        {t('common:experiment_notice.text')}
      </>
    ),
  });
}

// Here you can set app-specific global alerts
export const alertsConfig = alerts;
