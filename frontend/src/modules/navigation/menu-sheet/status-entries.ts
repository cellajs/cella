import type { TKey } from '~/lib/i18n-locales';
import type { HealthResponse, HealthStatus } from '~/modules/navigation/menu-sheet/query';

/** One status entry users recognise, graded by the worst of the backend health components it is built from. */
interface StatusEntry {
  id: string;
  label: TKey;
  description: TKey;
  /** Backend health components this entry rolls up; a component no entry lists stays off the panel. */
  components: readonly string[];
}

/** A graded entry; `component` and `reason` name the worst check when it is not healthy. */
export interface GradedStatusEntry {
  entry: StatusEntry;
  status: HealthStatus;
  component?: string;
  reason?: string;
}

const appEntry: StatusEntry = { id: 'app', label: 'c:app', description: 'c:app_status.text', components: ['api', 'database', 'authInvalidation'] };

/** The info panel's status entries in display order: the one place to show, group or describe a service. */
export const statusEntries: readonly StatusEntry[] = [
  appEntry,
  { id: 'live_updates', label: 'c:live_updates', description: 'c:live_updates_status.text', components: ['cdc'] },
  { id: 'collaboration', label: 'c:collaboration', description: 'c:collaboration_status.text', components: ['yjs'] },
  { id: 'ai_assistants', label: 'c:ai_assistants', description: 'c:ai_assistants_status.text', components: ['mcp'] },
  { id: 'connected_apps', label: 'c:connected_apps', description: 'c:connected_apps_status.text', components: ['oauth'] },
];

const RANK: Record<HealthStatus, number> = { healthy: 0, degraded: 1, unhealthy: 2 };

/**
 * Grades each entry by its worst component. An entry none of whose components the response carries (the service is
 * off) drops out; without a response the backend is unreachable, so only the app entry shows, unhealthy.
 */
export function gradeStatusEntries(health: HealthResponse | undefined): GradedStatusEntry[] {
  if (!health) return [{ entry: appEntry, status: 'unhealthy', component: 'api', reason: 'unreachable' }];

  return statusEntries.flatMap((entry) => {
    const present = entry.components.filter((name) => health.components[name]);
    if (!present.length) return [];

    const worst = present.reduce((a, b) => (RANK[health.components[b].status] > RANK[health.components[a].status] ? b : a));
    const { status, reason } = health.components[worst];
    return [status === 'healthy' ? { entry, status } : { entry, status, component: worst, reason }];
  });
}
