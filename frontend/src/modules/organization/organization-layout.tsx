import { Outlet } from '@tanstack/react-router';
import { appConfig, type ProductEntityType } from 'shared';
import { useOrganizationLayoutContext } from '~/hooks/use-route-context';
import { YjsTokenFetcher } from '~/modules/common/blocknote/yjs-token-fetcher';

/**
 * Product types edited through CollaborativeBlockNote. Empty in the template; apps list the types
 * whose backend module registers a `yjsMaterializer`. Only read when the Yjs service is enabled.
 */
const collaborativeProductTypes: readonly ProductEntityType[] = [];

/**
 * Organization layout body. Yjs tokens are fetched here, not beside an editor: a token is scoped
 * to a product type and tenant, and CollaborativeBlockNote latches collaborative or standalone
 * mode once per mount, so the token must be in the store before any document opens.
 */
export function OrganizationLayout() {
  const { organization, tenantId } = useOrganizationLayoutContext();
  const yjsTypes = appConfig.services.yjs.enabled ? collaborativeProductTypes : [];

  return (
    <>
      {yjsTypes.map((entityType) => (
        <YjsTokenFetcher
          key={entityType}
          entityType={entityType}
          tenantId={tenantId}
          organizationId={organization.id}
        />
      ))}
      <Outlet />
    </>
  );
}
