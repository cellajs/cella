import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { appConfig } from 'shared';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { toaster } from '~/modules/common/toaster/toaster';
import { ToolCard } from '~/modules/common/tool-card';
import { DeleteToolCard } from '~/modules/entities/channel-settings-tools';
import { TabsArrangementCard } from '~/modules/entities/tabs-arrangement-card';
import { DeleteOrganizations } from '~/modules/organization/delete-organizations';
import { useOrganizationUpdateMutation } from '~/modules/organization/query';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { UpdateOrganizationDetailsForm } from '~/modules/organization/update-organization-details-form';
import { UpdateOrganizationForm } from '~/modules/organization/update-organization-form';

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

export function OrganizationGeneralCard({ organization }: { organization: EnrichedOrganization }) {
  const callback = useSlugChangeCallback(organization);
  return (
    <ToolCard label="c:general" unsaved id="update-organization">
      <UpdateOrganizationForm organization={organization} callback={callback} />
    </ToolCard>
  );
}

export function OrganizationDetailsCard({ organization }: { organization: EnrichedOrganization }) {
  const callback = useSlugChangeCallback(organization);
  return (
    <ToolCard label="c:details" id="update-organization-details">
      <UpdateOrganizationDetailsForm organization={organization} callback={callback} />
    </ToolCard>
  );
}

export function OrganizationTabsCard({ organization }: { organization: EnrichedOrganization }) {
  const { mutate } = useOrganizationUpdateMutation();
  return (
    <TabsArrangementCard
      entity={organization}
      parentRouteId="/_app/$tenantId/$organizationSlug/organization"
      persist={(toolsConfig) =>
        mutate({ path: { tenantId: organization.tenantId, id: organization.id }, body: { toolsConfig } })
      }
    />
  );
}

export function OrganizationDeleteCard({ organization }: { organization: EnrichedOrganization }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <DeleteToolCard
      name={organization.name}
      resource="c:organization"
      dialogId="delete-organization"
      renderDialog={() => (
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
      )}
    />
  );
}
