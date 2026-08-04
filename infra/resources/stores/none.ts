import type { ProvisionedStore, StoreProvisioner } from '../../lib/stores';

/**
 * The empty store: provisions nothing and contributes no secrets. For apps
 * whose services are stateless or carry their backing-store configuration
 * entirely through app-owned runtime secrets.
 */
export function none(): StoreProvisioner {
  return {
    kind: 'none',
    provision(): ProvisionedStore {
      return { outputs: {}, secretValues: {} };
    },
  };
}
