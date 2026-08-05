// @vitest-environment jsdom
// tab-nav.tsx transitively imports use-breakpoints.tsx, which reads `window` at module load.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A minimal fake router: only the fields resolveNavTabs reads (routesById, children, options, path).
const fakeRoute = (over: Record<string, unknown>) => ({ children: [], options: { staticData: {} }, ...over });

const routesById: Record<string, unknown> = {};
vi.mock('~/routes/-router-instance', () => ({ getRouter: () => ({ routesById }) }));

import type { TKey } from '~/lib/i18n-locales';
import { defineFrontendModule } from '~/lib/module';
import { type GuardNavTabsOptions, guardNavTabs, resolveNavTabs } from '~/modules/common/page/tab-nav';

// Fixtures use synthetic labels that are not real translation keys.
const key = (s: string) => s as TKey;

// Tools register once (the registry is process-global); tests re-seed only the routes.
defineFrontendModule({
  name: 'test-tabs',
  owner: 'app',
  scope: ['frontend'],
  description: 'Registry tab test module.',
  tools: [
    { slot: 'organization.tabs', id: 'reports', label: key('c:reports'), order: 15, render: () => null },
    {
      slot: 'organization.tabs',
      id: 'reports-admin',
      label: key('c:reports'),
      order: 16,
      visibleTo: ['organization.admin'],
      render: () => null,
    },
    { slot: 'system.tabs', id: 'audit', label: key('c:audit'), order: 5, render: () => null },
  ],
});

/** Builds a parent layout route with two route-file tab children plus a `$tool` host child. */
function seedRoutes(id: string, tabsSlot: string) {
  const members = fakeRoute({
    path: 'members',
    fullPath: `${id}/members`,
    options: { staticData: { navTab: { id: 'members', label: key('c:members'), order: 10 } } },
  });
  const settings = fakeRoute({
    path: 'settings',
    fullPath: `${id}/settings`,
    options: { staticData: { navTab: { id: 'settings', label: key('c:settings'), order: 20, requires: 'update' } } },
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

describe('guardNavTabs forwards bare-parent and disabled-tab navigations in beforeLoad', () => {
  beforeEach(() => {
    for (const key of Object.keys(routesById)) delete routesById[key];
    seedRoutes('/org', 'organization.tabs');
  });

  type Match = { routeId: string; fullPath: string; params: unknown };

  /** Runs the guard, returning the thrown redirect's navigation options (undefined = passed). */
  function runGuard(matches: Match[], options?: GuardNavTabsOptions) {
    try {
      guardNavTabs(matches, '/org', options);
    } catch (thrown) {
      return (thrown as { options: Record<string, unknown> }).options;
    }
  }

  const parentMatch: Match = { routeId: '/org', fullPath: '/org', params: {} };

  it('lands a bare parent navigation on the first resolved tab, preserving location parts', () => {
    const options = runGuard([parentMatch]);
    expect(options?.to).toBe('/org/members');
    expect(options).toMatchObject({ replace: true, search: true, hash: true, params: true });
  });

  it('prefers defaultTabId when resolved, routing registry tabs through the $tool host', () => {
    const options = runGuard([parentMatch], { defaultTabId: 'reports' });
    expect(options?.to).toBe('/org/$tool');
    const params = options?.params as (prev: Record<string, string>) => Record<string, string>;
    expect(params({ tenantId: 't' })).toEqual({ tenantId: 't', tool: 'reports' });
  });

  it('falls back to the first resolved tab when defaultTabId is hidden by stored arrangement', () => {
    const options = runGuard([parentMatch], { defaultTabId: 'reports', slotConfig: { hidden: ['reports'] } });
    expect(options?.to).toBe('/org/members');
  });

  it('forwards off a route tab hidden by stored arrangement, and passes enabled tabs through', () => {
    const membersMatch: Match = { routeId: '/org/members', fullPath: '/org/members', params: {} };
    expect(runGuard([parentMatch, membersMatch])).toBeUndefined();
    // With members hidden the landing becomes the registry reports tab, via the $tool host
    const options = runGuard([parentMatch, membersMatch], { slotConfig: { hidden: ['members'] } });
    expect(options?.to).toBe('/org/$tool');
  });

  it('forwards off a registry tab hidden by stored arrangement, matched on the $tool param', () => {
    const toolMatch: Match = { routeId: '/org/$tool', fullPath: '/org/$tool', params: { tool: 'reports' } };
    expect(runGuard([parentMatch, toolMatch])).toBeUndefined();
    const options = runGuard([parentMatch, toolMatch], { slotConfig: { hidden: ['reports'] } });
    expect(options?.to).toBe('/org/members');
  });
});
