import type { EngineConfig } from '../../../config/engine-config';
import { healthContract } from '../../../config/health.config';
import { createFetchProbe } from '../../../tasks/wait-for-version';
import type { LiveRecord } from '../../deploy/live-record';
import { roleOf } from '../../machine-roles';
import { enabledServices, serviceEndpoints } from '../../services';
import { check, deployAction, diagAction } from '../check';
import type { StatusProvider } from '../types';

/** First 7 chars of a git SHA, the length humans and logs use. */
const short = (sha: string): string => sha.slice(0, 7);

/** A public service's live health/version probe, cross-referenced with the live record. */
export interface LiveServiceFact {
  slug: string;
  healthUrl: string;
  /** undefined when the probe was not run. `status: 0` means unreachable; `html` an answer by the frontend's page, not the service. */
  probe?: { status: number; version?: string; html?: true };
  /** The commit the live record says serves it, when known. */
  expectedSha?: string;
  /** The role whose machine serves it, when it is not its own: the single-process host for a service running there. */
  expectedFrom?: string;
}

/** The release a public service must serve: the commit of the role whose machine serves it, in the live record. A disabled service has none. */
export function expectedRelease(
  config: Pick<EngineConfig, 'services' | 'singleVM'>,
  slug: string,
  live: LiveRecord | undefined,
): Pick<LiveServiceFact, 'expectedSha' | 'expectedFrom'> {
  const role = roleOf(config, slug);
  if (!role) return {};
  const expectedSha = live?.roles[role]?.commit;
  return role === slug ? { expectedSha } : { expectedSha, expectedFrom: role };
}

export const liveProvider: StatusProvider<LiveServiceFact[]> = {
  domain: 'live',
  async gather(session) {
    let endpoints: ReturnType<typeof serviceEndpoints>;
    try {
      // A disabled service has no container and no route: its path falls through to the frontend, which is no reading of it.
      const enabled = new Set(enabledServices(session.appConfig.services).map((service) => service.slug));
      endpoints = serviceEndpoints(session.appConfig).filter((endpoint) => enabled.has(endpoint.slug));
    } catch {
      return undefined;
    }
    // Status is a snapshot, so a short timeout keeps the worst-case wait small when a service is down.
    const probe = createFetchProbe(3000);
    const live = (await session.scalewayFacts()).live;
    return Promise.all(
      endpoints.map(async (endpoint): Promise<LiveServiceFact> => {
        const healthUrl = `${endpoint.url.replace(/\/$/, '')}${healthContract.path}`;
        const result = await probe(healthUrl);
        return {
          slug: endpoint.slug,
          healthUrl,
          probe: { status: result.status, version: result.version },
          ...expectedRelease(session.appConfig, endpoint.slug, live),
        };
      }),
    );
  },
  evaluate(facts, session) {
    if (!facts) return [];
    return facts.map((svc) => {
      const service = check(`live.${svc.slug}`, `Service ${svc.slug}`);
      if (!svc.probe) return service.unknown(`not probed (${svc.healthUrl})`);
      if (svc.probe.html) {
        return service.missing(
          `answered by the frontend's page at ${svc.healthUrl}: the service runs no container or its route is gone`,
          diagAction(session.mode),
        );
      }
      if (svc.probe.status !== 200 && svc.probe.status !== 204) {
        const how = svc.probe.status === 0 ? 'unreachable' : `unhealthy (HTTP ${svc.probe.status})`;
        return service.missing(`${how} at ${svc.healthUrl}`, diagAction(session.mode));
      }
      const served = svc.probe.version ?? '<none>';
      if (svc.expectedSha && svc.probe.version !== svc.expectedSha) {
        const source = svc.expectedFrom ? ` (runs on the ${svc.expectedFrom} host)` : '';
        return service.warn(`serving ${short(served)}, expected ${short(svc.expectedSha)}${source}`, deployAction(session.mode), served);
      }
      return service.ok(`serving ${served === '<none>' ? served : short(served)}`, undefined, served === '<none>' ? undefined : served);
    });
  },
};
