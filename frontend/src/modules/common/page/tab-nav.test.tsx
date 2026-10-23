// @vitest-environment jsdom
// tab-nav.tsx transitively imports use-breakpoints.ts, which reads `window` at module load.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A minimal fake router: only the fields resolveNavTabs reads (routesById, children, options, path).
const fakeRoute = (over: Record<string, unknown>) => ({ children: [], options: { staticData: {} }, ...over });

const routesById: Record<string, unknown> = {};
vi.mock('~/routes/-router-instance', () => ({ getRouter: () => ({ routesById }) }));

import { assumeNoSurfaces, withSurface } from 'shared/testing/surfaces';
import type { TKey } from '~/lib/i18n-locales';
import { defineFrontendModule } from '~/lib/module';
import type { ResolvePlacementOptions } from '~/lib/placements';
import { assertSurfaces, guardNavTabs } from '~/modules/common/page/tab-nav';

// Fixtures use synthetic labels that are not real translation keys.
const key = (s: string) => s as TKey;

assumeNoSurfaces();

// Tools register once (the registry is process-global); tests re-seed only the routes.
defineFrontendModule({
  name: 'test-tabs',
  owner: 'app',
  scope: ['frontend'],
  description: 'Registry tab test module.',
  tools: [{ slot: 'organization.tabs', id: 'reports', label: key('c:reports'), order: 15, render: () => null }],
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

describe('assertSurfaces checks the route tree at startup', () => {
  beforeEach(() => {
    for (const key of Object.keys(routesById)) delete routesById[key];
  });

  it('accepts a surface list of route tabs and registry tools, and throws for any other id', () => {
    seedRoutes('/org', 'organization.tabs');
    withSurface('organization.tabs', ['reports', 'members', 'settings'], () => expect(() => assertSurfaces()).not.toThrow());
    withSurface('organization.tabs', ['members', 'ghost'], () => expect(() => assertSurfaces()).toThrowError(/lists 'ghost'/));
  });
});

describe('guardNavTabs forwards bare-parent and disabled-tab navigations in beforeLoad', () => {
  beforeEach(() => {
    for (const key of Object.keys(routesById)) delete routesById[key];
    seedRoutes('/org', 'organization.tabs');
  });

  type Match = { routeId: string; fullPath: string; params: unknown };

  /** Runs the guard, returning the thrown redirect's navigation options (undefined = passed). */
  function runGuard(matches: Match[], options?: Pick<ResolvePlacementOptions, 'slotConfig'>) {
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

  it('forwards off a route tab hidden by stored arrangement, and passes enabled tabs through', () => {
    const membersMatch: Match = { routeId: '/org/members', fullPath: '/org/members', params: {} };
    expect(runGuard([parentMatch, membersMatch])).toBeUndefined();
    // With members hidden the landing becomes the registry reports tab, via the $tool host
    const options = runGuard([parentMatch, membersMatch], { slotConfig: { hidden: ['members'] } });
    expect(options?.to).toBe('/org/$tool');
  });

  it('leaves behind the search of a tab it forwards off: its sort and filters mean nothing to the landing tab', () => {
    const membersMatch: Match = { routeId: '/org/members', fullPath: '/org/members', params: {} };
    const options = runGuard([parentMatch, membersMatch], { slotConfig: { hidden: ['members'] } });
    expect(options?.search).toEqual({});
    expect(options).toMatchObject({ replace: true, hash: true });
  });
});
