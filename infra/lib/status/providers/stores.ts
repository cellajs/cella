import { appStores } from '../../../config/stores.config';
import { errorMessage } from '../../utils/errors';
import { check } from '../check';
import type { StatusProvider } from '../types';

/** One registered store's config-posture verdict (its `validate()` result). */
export interface StoreValidationFact {
  id: string;
  kind: string;
  error?: string;
}

/**
 * Runs every registered store's `validate()` posture check (pure, no I/O) so
 * a store misconfiguration surfaces in `infra status` before it fails a
 * deploy. The registry's first store-plugin-contributed provider (P3).
 */
export const storesProvider: StatusProvider<StoreValidationFact[]> = {
  domain: 'stores',
  async gather() {
    return Object.entries(appStores).map(([id, store]) => {
      try {
        store.validate?.();
        return { id, kind: store.kind };
      } catch (error) {
        return { id, kind: store.kind, error: errorMessage(error) };
      }
    });
  },
  evaluate(facts) {
    return (facts ?? []).map((store) => {
      const c = check(`stores.${store.id}`, `Store ${store.id}`);
      return store.error ? c.error(store.error) : c.ok(`${store.kind} config valid`);
    });
  },
};
