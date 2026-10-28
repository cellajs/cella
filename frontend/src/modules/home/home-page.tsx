import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, ShieldAlertIcon } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { getTools, resolvePlacementList } from '~/lib/placements';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { SimpleHeader } from '~/modules/common/simple-header';
import { InvitationsTable } from '~/modules/me/invitations-table/invitations-table';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/modules/ui/card';
import { useCurrentUser } from '~/modules/user/user-store';

const slot = 'home.sections';

/** The signed-in home: an MFA alert for a user without MFA, pending invitations, then the `home.sections` slot apps fill from their module config. */
export function HomePage() {
  const { t } = useTranslation();
  const user = useCurrentUser();

  const sections = resolvePlacementList(slot, getTools(slot));

  return (
    <div className="container">
      <SimpleHeader heading="c:home" text="c:home.text" className="pt-4 md:pt-6" />
      {!user.mfaRequired && (
        <AlertBanner
          id="enable_mfa"
          variant="info"
          icon={ShieldAlertIcon}
          title="c:require_mfa"
          className="mt-4"
          action={
            <Button variant="info" soft size="sm" className="max-sm:w-full" render={<Link to="/account" hash="authentication" />}>
              {t('c:setup_resource', { resource: 'MFA' })}
              <ArrowRightIcon />
            </Button>
          }
        >
          {t('c:require_mfa.text')}
        </AlertBanner>
      )}
      <div className="mt-6 mb-24 hidden has-[div[role='grid']]:block">
        <Card className="pb-0">
          <CardHeader>
            <CardTitle level={2}>{t('c:pending_invitations')}</CardTitle>
          </CardHeader>
          <CardContent>
            <InvitationsTable />
          </CardContent>
        </Card>
      </div>
      {sections.map((tool) => (
        <Suspense key={tool.id} fallback={null}>
          {tool.render(user)}
        </Suspense>
      ))}
    </div>
  );
}
