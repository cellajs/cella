import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { appConfig } from 'shared';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { toaster } from '~/modules/common/toaster/toaster';
import { ToolsArrangementCard } from '~/modules/entities/tools-arrangement-card';
import { DeleteOrganizations } from '~/modules/organization/delete-organizations';
import { useOrganizationUpdateMutation } from '~/modules/organization/query';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { UpdateOrganizationDetailsForm } from '~/modules/organization/update-organization-details-form';
import { UpdateOrganizationForm } from '~/modules/organization/update-organization-form';

/** Redirects to the settings page under the new slug after a slug-changing update. */
function useSlugChangeCallback(organization: EnrichedOrganization) {
  const navigate = useNavigate();

  return (args: CallbackArgs<Organization>) => {
    if (args.status === 'success' && organization.slug !== args.data.slug) {
      navigate({
        to: '/$tenantId/$organizationSlug/organization/settings',
        params: { tenantId: organization.tenantId, organizationSlug: args.data.slug },
        hash: '',
        replace: true,
      });
    }
  };
}

/** General organization form body (name, slug, visuals). */
export function OrganizationGeneralForm({ organization }: { organization: EnrichedOrganization }) {
  const callback = useSlugChangeCallback(organization);
  return <UpdateOrganizationForm organization={organization} callback={callback} />;
}

/** Organization details form body (locale, contact, links). */
export function OrganizationDetailsForm({ organization }: { organization: EnrichedOrganization }) {
  const callback = useSlugChangeCallback(organization);
  return <UpdateOrganizationDetailsForm organization={organization} callback={callback} />;
}

/** Tools arrangement card wired to the organization update mutation. */
export function OrganizationToolsCard({ organization }: { organization: EnrichedOrganization }) {
  const { mutate } = useOrganizationUpdateMutation();
  return (
    <ToolsArrangementCard
      entity={organization}
      persist={(toolsConfig) =>
        mutate({ path: { tenantId: organization.tenantId, id: organization.id }, body: { toolsConfig } })
      }
    />
  );
}

/** Delete confirmation content for the organization danger zone. */
export function OrganizationDeleteDialog({ organization }: { organization: EnrichedOrganization }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <DeleteOrganizations
      dialog
      tenantId={organization.tenantId}
      organizations={[organization]}
      callback={({ status }: CallbackArgs<Organization[]>) => {
        if (status === 'success') {
          toaster.success(t('c:success.delete_resource', { resource: t('c:organization') }));
          navigate({ to: appConfig.defaultRedirectPath, replace: true });
        }
      }}
    />
  );
}
