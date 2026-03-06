import { Link } from '@tanstack/react-router';
import { ShieldAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { AlertWrap } from '~/modules/common/alert-wrap';
import { SimpleHeader } from '~/modules/common/simple-header';
import { InvitationsTable } from '~/modules/me/invitations-table';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/modules/ui/card';
import { useUserStore } from '~/store/user';

export function Home() {
  const { t } = useTranslation();
  const { user, isSystemAdmin } = useUserStore();

  const showMfaAlert = isSystemAdmin && !user.mfaRequired;

  return (
    <div className="container">
      <SimpleHeader
        heading={t('common:home')}
        text={t('common:home.text', { appName: appConfig.name })}
        className="pt-4 md:pt-6"
      />
      {showMfaAlert && (
        <AlertWrap id="enable_mfa" variant="plain" icon={ShieldAlertIcon} className="mt-4">
          <p>{t('common:require_mfa.text')}</p>
          <Button variant="plain" size="sm" className="mt-2" asChild>
            <Link to="/account" hash="authentication">
              {t('common:setup_resource', { resource: t('common:authentication').toLowerCase() })}
            </Link>
          </Button>
        </AlertWrap>
      )}
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
}
