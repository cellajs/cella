import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, ShieldAlertIcon } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { hierarchy } from 'shared';
import { getTools, resolvePlacementList } from '~/lib/placements';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { Logo } from '~/modules/common/logo';
import { CenteredPage } from '~/modules/common/page/centered-page';
import { PendingInvitations } from '~/modules/me/pending-invitations';
import { meInvitationsQueryOptions, myMembershipsQueryOptions } from '~/modules/me/query';
import { NoOrganizationAlert } from '~/modules/organization/no-organization-alert';
import { organizationsListQueryOptions } from '~/modules/organization/query';
import { Button } from '~/modules/ui/button';
import { useCurrentUser } from '~/modules/user/user-store';
import { flattenInfiniteData } from '~/query/basic/flatten';

const slot = 'home.sections';
const organizationAdminRole = hierarchy.getMostPrivilegedRole('organization');

/** The signed-in home in a column as wide as the create dialog: the app's logo linking to its About page, then one stack of alert rows (MFA for an organization admin, pending invitations, a create prompt for a user without an organization), then the `home.sections` slot apps fill. */
export function HomePage() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { data: myMemberships } = useQuery(myMembershipsQueryOptions());
  const { data: invitations } = useQuery(meInvitationsQueryOptions());
  const orgQuery = useInfiniteQuery(organizationsListQueryOptions({ relatableUserId: user.id }));

  const sections = resolvePlacementList(slot, getTools(slot));
  const isOrganizationAdmin = !!myMemberships?.results.some(
    ({ channelType, role }) => channelType === 'organization' && role === organizationAdminRole,
  );
  const hasNoOrganization = orgQuery.isSuccess && flattenInfiniteData<Organization>(orgQuery.data).length === 0;
  const hasInvitations = !!invitations?.results.length;

  return (
    <CenteredPage className="container max-w-2xl">
      <h1 className="sr-only">{t('c:home')}</h1>
      <div className="flex justify-center">
        <Link to="/about" className="focus-effect rounded-md transition-opacity hover:opacity-80">
          <Logo size="xl" title={t('c:about_app')} />
        </Link>
      </div>
      <div className="mt-8 flex flex-col gap-3 empty:hidden">
        {isOrganizationAdmin && !user.mfaRequired && (
          <AlertBanner
            id="enable_mfa"
            variant="info"
            icon={ShieldAlertIcon}
            title="c:require_mfa"
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
        <PendingInvitations />
        {hasNoOrganization && <NoOrganizationAlert hasInvitations={hasInvitations} />}
      </div>
      {sections.map((tool) => (
        <Suspense key={tool.id} fallback={null}>
          {tool.render(user)}
        </Suspense>
      ))}
    </CenteredPage>
  );
}
