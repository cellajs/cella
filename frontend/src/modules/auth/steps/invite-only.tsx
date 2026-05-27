import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';

/**
 * Displays a greeting and a message indicating that the app is invite-only.
 * Uses the app name from configuration for localization.
 */
export function InviteOnlyStep() {
  const { t } = useTranslation();

  return (
    <>
      <h1 className="mt-4 pb-2 text-center text-2xl">{t('c:hi')}</h1>
      <h2 className="mt-4 pb-4 text-center text-xl">{t('c:invite_only.text', { appName: appConfig.name })}</h2>
    </>
  );
}
