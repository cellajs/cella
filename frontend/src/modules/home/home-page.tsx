import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, Building2Icon, PlusIcon, ShieldAlertIcon } from 'lucide-react';
import { Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { hierarchy } from 'shared';
import { getMenuSection } from '~/lib/entity-modules';
import { getTools, resolvePlacementList } from '~/lib/placements';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { Logo } from '~/modules/common/logo';
import { InvitationsTable } from '~/modules/me/invitations-table/invitations-table';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { organizationsListQueryOptions } from '~/modules/organization/query';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/modules/ui/card';
import { useCurrentUser } from '~/modules/user/user-store';
import { flattenInfiniteData } from '~/query/basic/flatten';

const slot = 'home.sections';
const organizationAdminRole = hierarchy.getMostPrivilegedRole('organization');

/** The signed-in home: the app's logo linking to its About page, an MFA alert for an organization admin without MFA, a create prompt for a user without an organization, pending invitations, then the `home.sections` slot apps fill from their module config. */
export function HomePage() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { data: myMemberships } = useQuery(myMembershipsQueryOptions());
  const orgQuery = useInfiniteQuery(organizationsListQueryOptions({ relatableUserId: user.id }));
  const createButtonRef = useRef<HTMLButtonElement>(null);

  const sections = resolvePlacementList(slot, getTools(slot));
  const isOrganizationAdmin = !!myMemberships?.results.some(
    ({ channelType, role }) => channelType === 'organization' && role === organizationAdminRole,
  );
  const hasNoOrganization = orgQuery.isSuccess && flattenInfiniteData<Organization>(orgQuery.data).length === 0;
  const createOrganization = getMenuSection('organization')?.createAction;

  return (
    <div className="container">
      <h1 className="sr-only">{t('c:home')}</h1>
      <div className="flex justify-center pt-8 md:pt-12">
        <Link to="/about" className="focus-effect rounded-md transition-opacity hover:opacity-80">
          <Logo size="xl" title={t('c:about_app')} />
        </Link>
      </div>
      {isOrganizationAdmin && !user.mfaRequired && (
        <AlertBanner
          id="enable_mfa"
          variant="info"
          icon={ShieldAlertIcon}
          title="c:require_mfa"
          className="mt-8"
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
      {hasNoOrganization && createOrganization && (
        // The MFA alert's layout without its close button: the way to start stays until an organization exists
        <Alert className="mt-8">
          <Building2Icon />
          <AlertTitle>{t('c:no_organization_yet')}</AlertTitle>
          <AlertDescription>{t('c:no_organization_yet.text')}</AlertDescription>
          <AlertAction>
            <Button ref={createButtonRef} variant="secondary" size="sm" className="max-sm:w-full" onClick={() => createOrganization(createButtonRef)}>
              <PlusIcon />
              {t('c:create_resource', { resource: t('c:organization') })}
            </Button>
          </AlertAction>
        </Alert>
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
