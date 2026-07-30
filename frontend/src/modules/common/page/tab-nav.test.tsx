// @vitest-environment jsdom
// tab-nav.tsx transitively imports use-breakpoints.tsx, which reads `window` at module load.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A minimal fake router: only the fields resolveNavTabs reads (routesById, children, options, path).
const fakeRoute = (over: Record<string, unknown>) => ({ children: [], options: { staticData: {} }, ...over });

const routesById: Record<string, unknown> = {};
vi.mock('~/routes/-router-instance', () => ({ getRouter: () => ({ routesById }) }));

import { defineFrontendModule } from '~/lib/module';
import { resolveNavTabs } from '~/modules/common/page/tab-nav';

// Tools register once (the registry is process-global); tests re-seed only the routes.
defineFrontendModule({
  name: 'test-tabs',
  owner: 'app',
  scope: ['frontend'],
  description: 'Registry tab test module.',
  tools: [
    { slot: 'organization.tabs', id: 'reports', label: 'c:reports', order: 15, render: () => null },
    {
      slot: 'organization.tabs',
      id: 'reports-admin',
      label: 'c:reports',
      order: 16,
      visibleTo: ['organization.admin'],
      render: () => null,
    },
    { slot: 'system.tabs', id: 'audit', label: 'c:audit', order: 5, render: () => null },
  ],
});

/** Builds a parent layout route with two route-file tab children plus a `$tool` host child. */
function seedRoutes(id: string, tabsSlot: string) {
  const members = fakeRoute({
    path: 'members',
    fullPath: `${id}/members`,
    options: { staticData: { navTab: { id: 'members', label: 'c:members', order: 10 } } },
  });
  const settings = fakeRoute({
    path: 'settings',
    fullPath: `${id}/settings`,
    options: { staticData: { navTab: { id: 'settings', label: 'c:settings', order: 20, requires: 'update' } } },
  });
  const toolHost = fakeRoute({ path: '$tool', fullPath: `${id}/$tool` });
  routesById[id] = fakeRoute({ children: [members, settings, toolHost], options: { staticData: { tabsSlot } } });
}

describe('resolveNavTabs merges route-file and registry tabs', () => {
  beforeEach(() => {
    for (const key of Object.keys(routesById)) delete routesById[key];
  });

  it('interleaves a registry tab by order and routes it through the $tool host', () => {
    seedRoutes('/org', 'organization.tabs');
    // Grant only: reports-admin (visibleTo admin) stays hidden without a matching pair
    const tabs = resolveNavTabs('/org', { grants: ['update'] });
    expect(tabs.map((tab) => tab.id)).toEqual(['members', 'reports', 'settings']);

    const reports = tabs.find((tab) => tab.id === 'reports');
    expect(reports?.path).toBe('/org/$tool');
    // The registry tab preserves the surface's own params and sets only the host's $tool id
    const params = reports?.params as (prev: Record<string, string>) => Record<string, string>;
    expect(params({ tenantId: 't', organizationSlug: 'o' })).toEqual({
      tenantId: 't',
      organizationSlug: 'o',
      tool: 'reports',
    });
  });

  it('hides tabs whose requires/visibleTo condition is unmet', () => {
    seedRoutes('/org', 'organization.tabs');
    // No grants, no pairs: settings (requires update) and reports-admin (visibleTo admin) both drop
    expect(resolveNavTabs('/org').map((tab) => tab.id)).toEqual(['members', 'reports']);
    // Grant + pair restore both
    expect(resolveNavTabs('/org', { grants: ['update'], pairs: ['organization.admin'] }).map((tab) => tab.id)).toEqual([
      'members',
      'reports',
      'reports-admin',
      'settings',
    ]);
  });

  it('channel-stored arrangement reorders and hides tabs, keyed by the slot id', () => {
    seedRoutes('/org', 'organization.tabs');
    const tabs = resolveNavTabs('/org', {
      grants: ['update'],
      slotConfig: { order: ['reports', 'members'], hidden: ['settings'] },
    });
    // reports-admin still hidden (no pair); settings hidden by config; stored order wins
    expect(tabs.map((tab) => tab.id)).toEqual(['reports', 'members']);
  });

  it('serves a non-entity surface (system panel) with no render context', () => {
    seedRoutes('/system', 'system.tabs');
    // settings (requires update) drops without a grant; the registry system tab still appears
    expect(resolveNavTabs('/system').map((tab) => tab.id)).toEqual(['audit', 'members']);
  });
});
