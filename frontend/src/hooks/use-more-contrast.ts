import { useSyncExternalStore } from 'react';
import { uiStore, useUIStore } from '~/modules/ui/ui-store';

const deviceQuery = '(prefers-contrast: more)';
// jsdom has no matchMedia
const deviceAsks = () => !!globalThis.matchMedia?.(deviceQuery).matches;

/** Increased contrast is on: chosen under Preferences, or asked for by the device, which also covers signed-out pages. */
export const prefersMoreContrast = () => uiStore.getState().contrast === 'more' || deviceAsks();

function subscribeToDevice(onChange: () => void) {
  const query = globalThis.matchMedia?.(deviceQuery);
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

/** `prefersMoreContrast` for a component, which renders again when either source changes. */
export function useMoreContrast() {
  const chosen = useUIStore((state) => state.contrast === 'more');
  const asked = useSyncExternalStore(subscribeToDevice, deviceAsks, () => false);
  return chosen || asked;
}
