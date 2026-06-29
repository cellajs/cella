import { Link } from '@tanstack/react-router';
import { ShieldAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { SimpleHeader } from '~/modules/common/simple-header';
import { InvitationsTable } from '~/modules/me/invitations-table';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/modules/ui/card';
import { useUserStore } from '~/modules/user/user-store';

/**
 * Home page component displaying a welcome message and pending invitations for the user.
 * Shows an alert for system admins who have not enabled MFA.
 */
export function HomePage() {
  const { t } = useTranslation();
  const { user } = useUserStore();

  const showMfaAlert = !user.mfaRequired;

  return (
    <div className="container">
      <SimpleHeader
        heading={t('c:home')}
        text={t('c:home.text', { appName: appConfig.name })}
        className="pt-4 md:pt-6"
      />
      {showMfaAlert && (
        <AlertBanner id="enable_mfa" variant="plain" icon={ShieldAlertIcon} className="mt-4">
          <p>{t('c:require_mfa.text')}</p>
          <Button variant="plain" size="sm" className="mt-2" render={<Link to="/account" hash="authentication" />}>
            {t('c:setup_resource', { resource: t('c:authentication').toLowerCase() })}
          </Button>
        </AlertBanner>
      )}
      <div className="mt-6 mb-24 hidden has-[div[role='grid']]:block">
        <Card className="pb-0">
          <CardHeader>
            <CardTitle>{t('c:pending_invitations')}</CardTitle>
          </CardHeader>
          <CardContent>
            <InvitationsTable />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
