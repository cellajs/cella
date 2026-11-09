import { config } from 'shared/config/config.default';
import { servicePaths } from 'shared/config-builder/service-paths';
import { describe, expect, it } from 'vitest';
import { appServices } from '../../config/services.config';

/**
 * The engine reads config only through engine-config, so the registry repeats what the shared config
 * declares: a service's ports and the path it serves under. A local stack, the Vite proxy and a
 * deployed container must agree on them, so a drift fails here.
 */
describe('the service registry and the shared config', () => {
  const paths: Record<string, string> = servicePaths;
  const registry: Record<string, { port: number; internalPort?: number; pathPrefix?: string }> = appServices;
  const services: Record<string, { port: number; internalPort?: number } | undefined> = config.services;

  it.each(Object.keys(registry))('%s listens on the port the shared config gives it', (slug) => {
    const service = services[slug];
    expect(service, `services.${slug} in shared/config/config.default.ts`).toBeDefined();
    // The SPA proxy serves on the container's own port; every Node service on the port a local stack gives it.
    if (slug !== 'frontend') expect(registry[slug]?.port).toBe(service?.port);
    expect(registry[slug]?.internalPort).toBe(service?.internalPort);
  });

  it('routes each service under the path the shared config gives it', () => {
    for (const [slug, entry] of Object.entries(registry)) {
      if (entry.pathPrefix !== undefined) expect(entry.pathPrefix, slug).toBe(paths[slug]);
    }
    for (const slug of Object.keys(paths)) expect(registry[slug]?.pathPrefix, slug).toBe(paths[slug]);
  });
});
