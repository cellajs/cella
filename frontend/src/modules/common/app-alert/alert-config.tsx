import { t } from 'i18next';
import { Info } from 'lucide-react'; // Import your icons here
import type { AppAlert } from '.';

export const alertsConfig: AppAlert[] = [
  {
    id: 'prerelease',
    children: (
      <>
        <strong className="mr-2">{t('about:prerelease')}</strong>
        {t('common:experiment_notice.text')}
      </>
    ),
    className: 'rounded-none border-0 border-b',
    title: 'System Alert',
    Icon: Info,
  },
];
