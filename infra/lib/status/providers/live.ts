import type { EngineConfig } from '../../../config/engine-config';
import { healthContract } from '../../../config/health.config';
import { createFetchProbe } from '../../../tasks/wait-for-version';
import { rolloutOwner, serviceEndpoints } from '../../services';
import { check, deployAction, diagAction } from '../check';
import type { RolloutRowFact, StatusProvider } from '../types';

/** First 7 chars of a git SHA, the length humans and logs use. */
const short = (sha: string): string => sha.slice(0, 7);

/** A public service's live health/version probe, cross-referenced with control. */
export interface LiveServiceFact {
  slug: string;
  healthUrl: string;
  /** undefined when the probe was not run. `status: 0` means unreachable. */
  probe?: { status: number; version?: string };
  /** Expected SHA from the control object's active generation, when known. */
  expectedSha?: string;
  /** The service whose `active` pointer set `expectedSha`, when it is not this one: the singleVM host for a service running on its VM. */
  expectedFrom?: string;
}

/**
 * The release a public service must serve, from the active pointer of the service that rolls it out: its own when it boots its own VM, the singleVM
 * host's when it runs on the host VM. A disabled service has no expectation.
 */
export function expectedRelease(
  config: Pick<EngineConfig, 'services' | 'singleVM'>,
  slug: string,
  rollout: RolloutRowFact[] | undefined,
): Pick<LiveServiceFact, 'expectedSha' | 'expectedFrom'> {
  const owner = rolloutOwner(config.services, config.singleVM, slug);
  if (!owner) return {};
  const expectedSha = rollout?.find((r) => r.slug === owner)?.activeSha;
  return owner === slug ? { expectedSha } : { expectedSha, expectedFrom: owner };
}

export const liveProvider: StatusProvider<LiveServiceFact[]> = {
  domain: 'live',
  async gather(session) {
    let endpoints: ReturnType<typeof serviceEndpoints>;
    try {
      endpoints = serviceEndpoints(session.appConfig);
    } catch {
      return undefined;
    }
    // Status is a snapshot, not a rollout gate, so a shorter timeout than the
    // deploy poller keeps the worst-case wait small when a service is down.
    const probe = createFetchProbe(3000);
    const rollout = (await session.scalewayFacts()).rollout;
    return Promise.all(
      endpoints.map(async (endpoint): Promise<LiveServiceFact> => {
        const healthUrl = `${endpoint.url.replace(/\/$/, '')}${healthContract.path}`;
        const result = await probe(healthUrl);
        return {
          slug: endpoint.slug,
          healthUrl,
          probe: { status: result.status, version: result.version },
          ...expectedRelease(session.appConfig, endpoint.slug, rollout),
        };
      }),
    );
  },
  evaluate(facts, session) {
    if (!facts) return [];
    return facts.map((svc) => {
      const service = check(`live.${svc.slug}`, `Service ${svc.slug}`);
      if (!svc.probe) return service.unknown(`not probed (${svc.healthUrl})`);
      if (svc.probe.status !== 200 && svc.probe.status !== 204) {
        const how = svc.probe.status === 0 ? 'unreachable' : `unhealthy (HTTP ${svc.probe.status})`;
        return service.missing(`${how} at ${svc.healthUrl}`, diagAction(session.mode));
      }
      const served = svc.probe.version ?? '<none>';
      if (svc.expectedSha && svc.probe.version !== svc.expectedSha) {
        const source = svc.expectedFrom ? ` (runs on the ${svc.expectedFrom} host)` : '';
        return service.warn(`serving ${short(served)}, expected ${short(svc.expectedSha)}${source}`, deployAction(session.mode));
      }
      return service.ok(`serving ${served === '<none>' ? served : short(served)}`);
    });
  },
};
