import type { Organization } from 'sdk';
import { DeleteItems, type DeleteItemsProps } from '~/modules/common/delete-items';
import { useOrganizationDeleteMutation } from '~/modules/organization/query';

type Props = Pick<DeleteItemsProps<Organization, unknown>, 'dialog' | 'callback'> & { tenantId: string; organizations: Organization[] };

export function DeleteOrganizations({ tenantId, organizations, ...props }: Props) {
  const toVariables = (items: Organization[]) => ({
    path: { tenantId },
    body: { ids: items.map(({ id }) => id) },
    organizations: items,
  });
  return <DeleteItems items={organizations} useDelete={useOrganizationDeleteMutation} toVariables={toVariables} {...props} />;
}
