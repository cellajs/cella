import type { ProvisionedStore, StoreProvisioner } from '../../lib/stores';

/** The empty store: provisions nothing and contributes no secrets, for apps whose services are stateless or carry backing-store configuration in app-owned runtime secrets. */
export function none(): StoreProvisioner {
  return {
    kind: 'none',
    provision(): ProvisionedStore {
      return { outputs: {}, secretValues: {} };
    },
  };
}
