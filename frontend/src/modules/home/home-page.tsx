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
import { PendingInvitations } from '~/modules/me/pending-invitations';
import { meInvitationsQueryOptions, myMembershipsQueryOptions } from '~/modules/me/query';
import { organizationsListQueryOptions } from '~/modules/organization/query';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';
import { useCurrentUser } from '~/modules/user/user-store';
import { flattenInfiniteData } from '~/query/basic/flatten';
import { cn } from '~/utils/cn';

const slot = 'home.sections';
const organizationAdminRole = hierarchy.getMostPrivilegedRole('organization');

/** The signed-in home in a column as wide as the create dialog: the app's logo linking to its About page, then one stack of alert rows (MFA for an organization admin, pending invitations, a create prompt for a user without an organization), then the `home.sections` slot apps fill. */
export function HomePage() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { data: myMemberships } = useQuery(myMembershipsQueryOptions());
  const { data: invitations } = useQuery(meInvitationsQueryOptions());
  const orgQuery = useInfiniteQuery(organizationsListQueryOptions({ relatableUserId: user.id }));
  const createButtonRef = useRef<HTMLButtonElement>(null);

  const sections = resolvePlacementList(slot, getTools(slot));
  const isOrganizationAdmin = !!myMemberships?.results.some(
    ({ channelType, role }) => channelType === 'organization' && role === organizationAdminRole,
  );
  const hasNoOrganization = orgQuery.isSuccess && flattenInfiniteData<Organization>(orgQuery.data).length === 0;
  const hasInvitations = !!invitations?.results.length;
  const createOrganization = getMenuSection('organization')?.createAction;

  return (
    <div className="container max-w-2xl">
      <h1 className="sr-only">{t('c:home')}</h1>
      <div className="flex justify-center pt-8 md:pt-12">
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
        {hasNoOrganization && createOrganization && (
          // No close button: the way to start stays until an organization exists. Below an invitation it takes the
          // invitation row's weight: answering that comes first, and a new organization may duplicate the team's.
          <Alert className={cn('gap-y-1', !hasInvitations && 'p-4')}>
            <Building2Icon />
            <AlertTitle className="line-clamp-none text-balance">{t('c:no_organization_yet')}</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              {t(hasInvitations ? 'c:no_organization_yet.text_invited' : 'c:no_organization_yet.text')}
            </AlertDescription>
            <AlertAction className={cn(!hasInvitations && 'mt-3')}>
              <Button
                ref={createButtonRef}
                variant={hasInvitations ? 'secondary' : 'default'}
                size={hasInvitations ? 'sm' : 'default'}
                className="max-sm:w-full"
                onClick={() => createOrganization(createButtonRef)}
              >
                <PlusIcon />
                {t('c:create_resource', { resource: t('c:organization') })}
              </Button>
            </AlertAction>
          </Alert>
        )}
      </div>
      {sections.map((tool) => (
        <Suspense key={tool.id} fallback={null}>
          {tool.render(user)}
        </Suspense>
      ))}
    </div>
  );
}
