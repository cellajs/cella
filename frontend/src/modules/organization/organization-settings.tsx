// import { Subscription } from '~/modules/tenants/subscription';

import { useNavigate } from '@tanstack/react-router';
import { TrashIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { appConfig } from 'shared';
import { useOrganizationLayoutContext } from '~/hooks/use-route-context';
import { getPlacements, type PlacementTab } from '~/lib/placements';
import { AsideAnchor } from '~/modules/common/aside-anchor';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { PageAside } from '~/modules/common/page/aside';
import { toaster } from '~/modules/common/toaster/toaster';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { useResolveCan } from '~/modules/entities/use-resolve-can';
import { DeleteOrganizations } from '~/modules/organization/delete-organizations';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { UpdateOrganizationDetailsForm } from '~/modules/organization/update-organization-details-form';
import { UpdateOrganizationForm } from '~/modules/organization/update-organization-form';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';

/** One settings section: aside tab descriptor plus the rendered card, sorted on `order`. */
type SettingsSection = PlacementTab & { order: number; node: ReactNode };

function OrganizationSettings({ organization }: { organization: EnrichedOrganization }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tenantId } = useOrganizationLayoutContext();

  // The settings ROUTE requires `can.organization.update`; the danger zone is gated on its
  // own action. Update and delete are distinct grants in the can map, and an app may split
  // them even though the template's admin role holds both.
  const resolveCan = useResolveCan();
  const canDelete = resolveCan(organization.can?.organization?.delete, organization.createdBy);

  // Grants for placement gating: contributions declaring `requires` hide without them
  const grants = canDelete ? ['update', 'delete'] : ['update'];

  const deleteButtonRef = useRef(null);

  const openDeleteDialog = () => {
    useDialoger.getState().create(
      <DeleteOrganizations
        dialog
        tenantId={tenantId}
        organizations={[organization]}
        callback={({ status }: CallbackArgs<Organization[]>) => {
          if (status === 'success') {
            toaster.success(t('c:success.delete_resource', { resource: t('c:organization') }));
            navigate({ to: appConfig.defaultRedirectPath, replace: true });
          }
        }}
      />,
      {
        id: 'delete-organization',
        triggerRef: deleteButtonRef,
        className: 'md:max-w-xl',
        title: t('c:delete_resource', { resource: t('c:organization').toLowerCase() }),
        description: t('c:confirm.delete_resource', {
          name: organization.name,
          resource: t('c:organization').toLowerCase(),
        }),
      },
    );
  };

  const callback = (args: CallbackArgs<Organization>) => {
    if (args.status === 'success' && organization.slug !== args.data.slug) {
      navigate({
        to: '/$tenantId/$organizationSlug/organization/settings',
        params: { tenantId, organizationSlug: args.data.slug },
        hash: '',
        replace: true,
      });
    }
  };

  // Module contributions for this page's placement slot, wrapped in the standard titled card
  const contributionSections: SettingsSection[] = getPlacements('organization.settings.aside')
    .filter((placement) => !placement.requires || grants.includes(placement.requires))
    .map((placement) => ({
      ...placement,
      order: placement.order ?? 50,
      node: (
        <Card id={placement.id}>
          <CardHeader>
            <CardTitle>{t(placement.label, { resource: t(placement.resource || '').toLowerCase() })}</CardTitle>
          </CardHeader>
          <CardContent>{placement.render(organization)}</CardContent>
        </Card>
      ),
    }));

  const sections: SettingsSection[] = [
    {
      id: 'general',
      label: 'c:general',
      order: 10,
      node: (
        <Card id="update-organization">
          <CardHeader>
            <CardTitle>
              <UnsavedBadge title={t('c:general')} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <UpdateOrganizationForm organization={organization} callback={callback} />
          </CardContent>
        </Card>
      ),
    },
    {
      id: 'details',
      label: 'c:details',
      order: 20,
      node: (
        <Card id="update-organization-details">
          <CardHeader>
            <CardTitle>{t('c:details')}</CardTitle>
          </CardHeader>
          <CardContent>
            <UpdateOrganizationDetailsForm organization={organization} callback={callback} />
          </CardContent>
        </Card>
      ),
    },
    // { id: 'subscription', label: 'c:subscription', order: 30, node: <Subscription organization={organization} /> },
    ...contributionSections,
    ...(canDelete
      ? [
          {
            id: 'delete-organization',
            label: 'c:delete_resource',
            resource: 'c:organization',
            order: 90,
            node: (
              <Card>
                <CardHeader>
                  <CardTitle>{t('c:delete_resource', { resource: t('c:organization').toLowerCase() })}</CardTitle>
                  <CardDescription>
                    <Trans
                      t={t}
                      i18nKey="c:delete_resource_notice.text"
                      values={{ name: organization.name, resource: t('c:organization').toLowerCase() }}
                    />
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    ref={deleteButtonRef}
                    variant="destructive"
                    className="w-full sm:w-auto"
                    onClick={openDeleteDialog}
                  >
                    <TrashIcon className="mr-2 size-4" />
                    <span>{t('c:delete_resource', { resource: t('c:organization').toLowerCase() })}</span>
                  </Button>
                </CardContent>
              </Card>
            ),
          },
        ]
      : []),
  ].sort((a, b) => a.order - b.order);

  return (
    <div className="container mx-auto my-4 gap-4 md:flex md:flex-row">
      <div className="mx-auto flex h-auto flex-col max-md:hidden md:w-[30%] md:min-w-48">
        <div className="max-md:block! sticky top-15 z-10 max-h-[calc(100dvh-3.75rem)] overflow-y-auto md:mt-3">
          <PageAside tabs={sections} className="pb-2" />
        </div>
      </div>

      <div className="flex flex-col gap-8 md:w-[70%]">
        {sections.map(({ id, node }) => (
          <AsideAnchor key={id} id={id} extraOffset>
            {node}
          </AsideAnchor>
        ))}
      </div>
    </div>
  );
}

export { OrganizationSettings };
