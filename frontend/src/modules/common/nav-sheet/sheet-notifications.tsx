import React from 'react';
import { useTranslation } from 'react-i18next';

import { SheetTitle } from '~/modules/ui/sheet';

export const SheetNotifications: React.FC = () => {
  const { t } = useTranslation();

  return <SheetTitle>{t('common:notifications')}</SheetTitle>;
};
