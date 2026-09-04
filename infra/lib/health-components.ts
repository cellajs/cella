/**
 * Component verdicts from the primary service's aggregate `/health?depth=full` body, shared by the post-deploy smoke
 * step and `infra status` so both read the same body the same way and agree on what warns and what fails.
 */

/** A single non-healthy component found in a /health?depth=full body. */
export interface ComponentIssue {
  name: string;
  status: string;
  reason?: string;
}

/** How a set of component issues should surface: `warn` keeps a run green with an annotation, `error` fails it. */
export type ComponentSeverity = 'warn' | 'error';

/** Every non-healthy component in a deep health response. A malformed response yields a synthetic issue. */
export function unhealthyComponents(body: string): ComponentIssue[] {
  let parsed: { components?: Record<string, { status?: string; reason?: string }> };
  try {
    parsed = JSON.parse(body);
  } catch {
    return [{ name: '<body>', status: 'unparseable' }];
  }
  const components = parsed.components;
  if (!components || typeof components !== 'object') return [{ name: '<components>', status: 'missing' }];

  const issues: ComponentIssue[] = [];
  for (const [name, component] of Object.entries(components)) {
    if (component?.status !== 'healthy')
      issues.push({ name, status: component?.status ?? 'unknown', reason: component?.reason });
  }
  return issues;
}

/**
 * Degraded components (stale report, paused replication, lag) are slow, not down, so they warn; anything else
 * (unhealthy, unknown, or a malformed body) is a failure. Call only with a non-empty issue list.
 */
export function componentSeverity(issues: readonly ComponentIssue[]): ComponentSeverity {
  return issues.every((issue) => issue.status === 'degraded') ? 'warn' : 'error';
}

/** Render component issues as a compact `name=status(reason)` list for CI logs and the status report. */
export function formatComponentIssues(issues: readonly ComponentIssue[]): string {
  return issues.map((i) => `${i.name}=${i.status}${i.reason ? `(${i.reason})` : ''}`).join(', ');
}
