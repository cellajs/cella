import { appConfig } from 'config';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SimpleHeader } from '~/modules/common/simple-header';
import InvitationsTable from '~/modules/me/invitations-table';
import { Card, CardContent, CardHeader, CardTitle } from '~/modules/ui/card';
import { useAlertStore } from '~/store/alert';
import { useUserStore } from '~/store/user';

const Home = () => {
  const { t } = useTranslation();
  const { setDownAlert } = useAlertStore();

  useEffect(() => {
    const { user } = useUserStore.getState();
    if (user.role === 'admin' && !user.mfaRequired && appConfig.mode === 'production') setDownAlert('enable_mfa');
  }, []);

  return (
    <div className="px-3 md:px-6">
      <SimpleHeader heading={t('common:home')} text={t('common:home.text', { appName: appConfig.name })} className="container pt-4 md:pt-6" />
      <div className="container mt-6 mb-24">
        <Card className="hidden has-[div[role='grid']]:block">
          <CardHeader>
            <CardTitle>{t('common:pending_invitations')}</CardTitle>
          </CardHeader>
          <CardContent>
            <InvitationsTable />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Home;
