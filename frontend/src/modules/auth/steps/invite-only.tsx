import { appConfig } from 'config';
import { useTranslation } from 'react-i18next';

/**
 *
 */
export const InviteOnlyStep = () => {
  const { t } = useTranslation();

  return (
    <>
      <h1 className="text-2xl text-center pb-2 mt-4">{t('common:hi')}</h1>
      <h2 className="text-xl text-center pb-4 mt-4">{t('common:invite_only.text', { appName: appConfig.name })}</h2>
    </>
  );
};
