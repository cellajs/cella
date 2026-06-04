import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { SimpleHeader } from '~/modules/common/simple-header';
import { InvitationsTable } from '~/modules/me/invitations-table';
import { Card, CardContent, CardHeader, CardTitle } from '~/modules/ui/card';
import { WorkspacesGrid } from '~/modules/workspace/workspaces-grid';

/**
 * Home page to be customized by the app.
 */
export function HomePage() {
  const { t } = useTranslation();

  return (
    <>
      <SimpleHeader
        heading={t('c:home')}
        text={t('c:home.text', { appName: appConfig.name })}
        className="container pt-4 md:pt-6"
      />
      <div className="container mt-6 mb-24 hidden has-[div[role='grid']]:block">
        <Card>
          <CardHeader>
            <CardTitle>{t('c:pending_invitations')}</CardTitle>
          </CardHeader>
          <CardContent>
            <InvitationsTable />
          </CardContent>
        </Card>
      </div>
      <div className="container py-4 md:py-6">
        <WorkspacesGrid saveDataInSearch={false} focusView={false} />
      </div>
    </>
  );
}
