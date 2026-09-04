import { healthContract } from '../../../config/health.config';
import { createFetchGet } from '../../../tasks/smoke';
import {
  type ComponentIssue,
  componentSeverity,
  formatComponentIssues,
  unhealthyComponents,
} from '../../health-components';
import { deployedServices, serviceEndpoints } from '../../services';
import { check, diagAction } from '../check';
import type { Check, StatusProvider } from '../types';

/** The primary-rollout service's aggregate `/health?depth=full` read, the same body the post-deploy smoke step judges. */
export interface ComponentsFact {
  slug: string;
  url: string;
  /** HTTP status of the aggregate; a 503 still carries the component body. */
  httpStatus?: number;
  /** undefined when the aggregate was unreachable. */
  issues?: ComponentIssue[];
}

/** One verdict rule with the smoke step: only-degraded warns, anything unhealthy (or a non-ok aggregate with no issue) is an error. */
function componentsCheck(facts: ComponentsFact, mode: string): Check {
  const components = check('live.components', 'Primary components');
  if (facts.issues === undefined) return components.missing(`unreachable at ${facts.url}`, diagAction(mode));
  if (facts.issues.length === 0) {
    return facts.httpStatus !== undefined && facts.httpStatus < 400
      ? components.ok(`all healthy (${facts.slug})`)
      : components.error(`HTTP ${facts.httpStatus} with no component issue at ${facts.url}`, diagAction(mode));
  }
  const detail = formatComponentIssues(facts.issues);
  return componentSeverity(facts.issues) === 'warn'
    ? components.warn(detail)
    : components.error(detail, diagAction(mode));
}

export const componentsProvider: StatusProvider<ComponentsFact> = {
  domain: 'components',
  async gather(session) {
    const cfg = session.appConfig;
    let endpoint: { slug: string; url: string } | undefined;
    try {
      const primary = deployedServices(cfg.services, cfg.singleVM).find((s) => s.primaryRollout);
      endpoint = serviceEndpoints(cfg).find((e) => e.slug === primary?.slug);
    } catch {
      return undefined;
    }
    if (!endpoint) return undefined;
    const url = `${endpoint.url.replace(/\/$/, '')}${healthContract.path}?depth=full`;
    try {
      // Same short timeout as the live version probe: status is a snapshot, not a rollout gate.
      const res = await createFetchGet(3000)(url);
      return { slug: endpoint.slug, url, httpStatus: res.status, issues: unhealthyComponents(res.body) };
    } catch {
      return { slug: endpoint.slug, url };
    }
  },
  evaluate(facts, session) {
    if (!facts) return [];
    return [componentsCheck(facts, session.mode)];
  },
};
