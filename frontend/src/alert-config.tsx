import { t } from 'i18next';
import { Info } from 'lucide-react';
import type { AppAlert } from '~/modules/common/app-alert';

export const alertsConfig: AppAlert[] = [
  {
    id: 'prerelease',
    Icon: Info,
    className: 'rounded-none border-0 border-b',
    children: (
      <>
        <strong className="mr-2">{t('about:prerelease')}</strong>
        {t('common:experiment_notice.text')}
      </>
    ),
  },
];
