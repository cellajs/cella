import { describe, expect, it } from 'vitest';
import {
  appStorageNeeds,
  coHostedServices,
  collocatedServices,
  deployedServices,
  enabledServices,
  placeServices,
  principalSecretScopeSlugs,
  principalServices,
  type ServiceDefinition,
  secretScopeSlugs,
  services,
} from './services';

const allOn = { yjs: { enabled: true }, mcp: { enabled: true } };
const allOff = { yjs: { enabled: false }, mcp: { enabled: false } };

describe('service registry: enabledServices', () => {
  it('includes services that do not opt out in appConfig.services', () => {
    const off = enabledServices(allOff).map((s) => s.slug);
    expect(off).toContain('backend');
    expect(off).toContain('cdc');
    expect(off).toContain('frontend');
  });

  it('excludes a service whose appConfig service entry is disabled', () => {
    const off = enabledServices(allOff).map((s) => s.slug);
    expect(off).not.toContain('yjs');
    expect(off).not.toContain('mcp');
  });

  it('allows disabling internal-only services without a public URL', () => {
    const withoutCdc = enabledServices({ cdc: { enabled: false } }).map((s) => s.slug);
    expect(withoutCdc).not.toContain('cdc');
  });

  it('includes a service whose appConfig service entry is enabled', () => {
    const on = enabledServices(allOn).map((s) => s.slug);
    expect(on).toContain('yjs');
    expect(on).toContain('mcp');
  });

  it('toggles yjs and mcp independently', () => {
    const yjsOnly = enabledServices({ yjs: { enabled: true }, mcp: { enabled: false } }).map((s) => s.slug);
    expect(yjsOnly).toContain('yjs');
    expect(yjsOnly).not.toContain('mcp');
  });
});

describe('service registry: singleVM (deployedServices / coHostedServices)', () => {
  it('split-VM (singleVM off) deploys every enabled service on its own VM', () => {
    const deployed = deployedServices(allOn, false).map((s) => s.slug);
    expect(deployed).toEqual(enabledServices(allOn).map((s) => s.slug));
    expect(deployed).toContain('cdc');
    expect(deployed).toContain('yjs');
    expect(deployed).toContain('mcp');
  });

  it('singleVM folds workers and collocates the SPA proxy: only the host VM remains', () => {
    const deployed = deployedServices(allOn, true).map((s) => s.slug);
    expect(deployed).toEqual(['backend']);
  });

  it('collocatedServices lists placement-host services, only under singleVM', () => {
    expect(collocatedServices(allOn, false)).toEqual([]);
    expect(collocatedServices(allOn, true).map((s) => s.slug)).toEqual(['frontend']);
  });

  it('a disabled placement-host service is not collocated', () => {
    expect(collocatedServices({ frontend: { enabled: false } }, true)).toEqual([]);
  });

  it('coHostedServices lists only enabled co-hosted workers, and only under singleVM', () => {
    expect(coHostedServices(allOn, false)).toEqual([]);
    const folded = coHostedServices(allOn, true).map((s) => s.slug);
    expect(folded).toContain('cdc');
    expect(folded).toContain('yjs');
    expect(folded).toContain('mcp');
    expect(folded).not.toContain('backend');
    expect(folded).not.toContain('frontend');
  });

  it('a disabled co-hosted worker is neither deployed nor folded under singleVM', () => {
    const cfg = { yjs: { enabled: false }, mcp: { enabled: true } };
    expect(coHostedServices(cfg, true).map((s) => s.slug)).not.toContain('yjs');
    expect(deployedServices(cfg, true).map((s) => s.slug)).not.toContain('yjs');
  });
});

describe('placeServices (placement is independent of enablement)', () => {
  it('split-VM places every given service on its own VM and folds nothing', () => {
    const placed = placeServices(services, false);
    expect(placed.vm).toEqual(services);
    expect(placed.coHosted).toEqual([]);
    expect(placed.collocated).toEqual([]);
  });

  it('singleVM keeps the host, folds co-hosted workers, collocates placement-host containers', () => {
    const placed = placeServices(services, true);
    expect(placed.vm.map((s) => s.slug)).toEqual(['backend']);
    expect(placed.coHosted.map((s) => s.slug)).toEqual(['cdc', 'yjs', 'mcp']);
    expect(placed.collocated.map((s) => s.slug)).toEqual(['frontend']);
  });

  it('applies the same placement to a narrower list (the enabled set)', () => {
    const placed = placeServices(enabledServices(allOff), true);
    expect(placed.vm.map((s) => s.slug)).toEqual(['backend']);
    expect(placed.coHosted.map((s) => s.slug)).toEqual(['cdc']);
    expect(placed.collocated.map((s) => s.slug)).toEqual(['frontend']);
  });
});

describe('registry view: bootstrap-owned IAM ignores enablement', () => {
  it('split-VM: every registry service owns a principal, whatever appConfig enables', () => {
    expect(principalServices(false).map((s) => s.slug)).toEqual(['backend', 'cdc', 'yjs', 'mcp', 'frontend']);
  });

  it('singleVM: only the host owns a principal', () => {
    expect(principalServices(true).map((s) => s.slug)).toEqual(['backend']);
  });

  it('singleVM host scope unions every registry worker and collocated container, enabled or not', () => {
    expect(principalSecretScopeSlugs(true, 'backend')).toEqual(['backend', 'cdc', 'yjs', 'mcp', 'frontend']);
  });

  it('a non-host principal reads only its own folder', () => {
    expect(principalSecretScopeSlugs(true, 'cdc')).toEqual(['cdc']);
    expect(principalSecretScopeSlugs(false, 'backend')).toEqual(['backend']);
    expect(principalSecretScopeSlugs(false, 'yjs')).toEqual(['yjs']);
  });

  it('secretScopeSlugs over the enabled set still narrows to what is enabled', () => {
    expect(secretScopeSlugs(enabledServices(allOff), true, 'backend')).toEqual(['backend', 'cdc', 'frontend']);
    expect(secretScopeSlugs(services, true, 'backend')).toEqual(principalSecretScopeSlugs(true, 'backend'));
  });
});

describe('service registry: lbRoute contract', () => {
  it('frontend (the app origin) is the default LB backend', () => {
    expect(services.find((s) => s.slug === 'frontend')?.lbRoute).toBe('default');
  });

  it('backend / yjs / mcp are path-routed (same-origin model)', () => {
    for (const name of ['backend', 'yjs', 'mcp'] as const) {
      expect(services.find((s) => s.slug === name)?.lbRoute).toBe('path');
    }
  });

  it('cdc has no LB route (internal-only)', () => {
    expect(services.find((s) => s.slug === 'cdc')?.lbRoute).toBeUndefined();
  });

  it('keeps appConfig enablement out of the deploy registry', () => {
    expect(services.find((s) => s.slug === 'yjs')).not.toHaveProperty('enabled');
    expect(services.find((s) => s.slug === 'mcp')).not.toHaveProperty('enabled');
    expect(services.find((s) => s.slug === 'backend')).not.toHaveProperty('enabled');
  });
});

describe('appStorageNeeds (P2 optional app storage)', () => {
  const svc = (partial: { slug: string; lbRoute?: string; s3Access?: boolean }) =>
    partial as unknown as ServiceDefinition;

  it("cella's registry needs everything: SPA bucket, upload buckets, browser origin", () => {
    const needs = appStorageNeeds(services);
    expect(needs).toEqual({ spaBucket: true, uploadBuckets: true, browserOriginSlug: 'frontend' });
  });

  it('a frontend-less API+worker registry needs no app buckets at all', () => {
    const needs = appStorageNeeds([svc({ slug: 'api', lbRoute: 'path' }), svc({ slug: 'worker' })]);
    expect(needs).toEqual({ spaBucket: false, uploadBuckets: false, browserOriginSlug: undefined });
  });

  it('an s3Access service without a browser app gets upload buckets but no CORS origin', () => {
    const needs = appStorageNeeds([svc({ slug: 'api', lbRoute: 'path', s3Access: true })]);
    expect(needs).toEqual({ spaBucket: false, uploadBuckets: true, browserOriginSlug: undefined });
  });
});
