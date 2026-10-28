import '~/query/tests/query-client-env';
import { onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

// A test of a module's mutation hooks imports this file first, mocks `sdk` with spies, then imports the module's
// `query.ts`: the hooks run under the app's own query client, as a queued mutation does after a reload.
export const { queryClient } = await import('~/query/query-client');

// The retry that leads to the pause waits for this delay first.
const defaults = queryClient.getDefaultOptions();
queryClient.setDefaultOptions({ ...defaults, mutations: { ...defaults.mutations, retryDelay: 0 } });

/** Runs a hook in one server render under the app's query client; the mutate functions it returns work after the render. */
export function callHook<T>(useHook: () => T): T {
  const captured: { result?: T } = {};
  const Probe = () => {
    captured.result = useHook();
    return null;
  };
  renderToStaticMarkup(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)));
  return captured.result as T;
}

/** A spy on an SDK call, as far as going offline needs it. */
type SdkSpy = { mockImplementation: (implementation: () => Promise<never>) => unknown };

/** Takes the network away: each given SDK call fails as a browser fetch does without one, which parks its mutation in the offline queue. */
export function goOffline(...sdkCalls: SdkSpy[]): void {
  onlineManager.setOnline(false);
  for (const sdkCall of sdkCalls) {
    sdkCall.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
  }
}

/** Brings the network back and replays the queue, as a reconnect does. */
export async function goOnline(): Promise<void> {
  onlineManager.setOnline(true);
  await queryClient.resumePausedMutations();
}

/** The mutations of one operation of an entity type, in the order they were issued. */
export const mutationsOf = (entityType: string, operation: 'create' | 'update' | 'delete') =>
  queryClient.getMutationCache().findAll({ mutationKey: [entityType, operation] });

/** The `afterEach` of a mutation hook test: an empty cache and queue, the network back, every spy reset. */
export function resetMutationHooks(): void {
  queryClient.clear();
  onlineManager.setOnline(true);
  vi.resetAllMocks();
}
