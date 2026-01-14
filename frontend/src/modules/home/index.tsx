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
    const { user, systemRole } = useUserStore.getState();
    if (systemRole === 'admin' && !user.mfaRequired && appConfig.mode === 'production') setDownAlert('enable_mfa');
  }, []);

  return (
    <div className="container">
      <SimpleHeader
        heading={t('common:home')}
        text={t('common:home.text', { appName: appConfig.name })}
        className="pt-4 md:pt-6"
      />
      <div className="mt-6 mb-24 hidden has-[div[role='grid']]:block">
        <Card className="pb-0">
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
