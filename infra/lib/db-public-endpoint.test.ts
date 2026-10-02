import { describe, expect, it } from 'vitest';
import {
  type CloseEndpointsEffects,
  closePublicEndpoints,
  closureVerdict,
  dbExposureConfigured,
  dbInstanceUrn,
  endpointAddress,
  publicEndpoints,
} from './db-public-endpoint';
import type { RdbEndpoint, RdbInstance } from './scaleway/scaleway-rdb';

// Endpoint shapes as the RDB API returns them: one detail object set, the other two null.
const privateEndpoint: RdbEndpoint = {
  id: 'ep-private',
  ip: '10.0.0.5',
  port: 5432,
  hostname: 'abc.rdb.fr-par.privatedns',
  private_network: { private_network_id: 'pn-1', provisioning_mode: 'ipam' },
  load_balancer: null,
  direct_access: null,
};
const lbEndpoint: RdbEndpoint = { id: 'ep-lb', ip: '51.158.210.62', port: 6317, hostname: null, private_network: null, load_balancer: {} };

const instance = (status: string, endpoints: RdbEndpoint[]): RdbInstance => ({ id: 'i-1', name: 'cella-postgres', status, endpoints });

describe('dbInstanceUrn', () => {
  it('addresses the instance resource of the program for a targeted refresh', () => {
    expect(dbInstanceUrn('organization/infra/production')).toBe('urn:pulumi:production::infra::scaleway:databases/instance:Instance::main-postgres');
  });
});

describe('dbExposureConfigured', () => {
  it('reads the committed stack config when no exposure overlay exists', () => {
    expect(dbExposureConfigured('no-such-mode', 'config:\n  infra:dbPublicEndpoint: "true"\n')).toBe(true);
    expect(dbExposureConfigured('no-such-mode', 'config:\n  infra:region: fr-par\n')).toBe(false);
  });
});

describe('publicEndpoints', () => {
  it('selects the load-balancer endpoint and never the private-network one the services use', () => {
    expect(publicEndpoints(instance('ready', [privateEndpoint, lbEndpoint]))).toEqual([lbEndpoint]);
  });

  it('ignores a direct-access endpoint and an instance without endpoints', () => {
    expect(publicEndpoints(instance('ready', [{ id: 'ep-direct', port: 5432, direct_access: {} }]))).toEqual([]);
    expect(publicEndpoints({})).toEqual([]);
  });

  it('names an endpoint by hostname, else by IP', () => {
    expect(endpointAddress(lbEndpoint)).toBe('51.158.210.62:6317');
    expect(endpointAddress({ ...lbEndpoint, hostname: 'db.example.com' })).toBe('db.example.com:6317');
  });
});

describe('closureVerdict', () => {
  it('is closed only once the instance is ready with no public endpoint', () => {
    expect(closureVerdict(instance('ready', [privateEndpoint]))).toEqual({ closed: true, remaining: [] });
    expect(closureVerdict(instance('configuring', [privateEndpoint])).closed).toBe(false);
    expect(closureVerdict(instance('ready', [privateEndpoint, lbEndpoint]))).toEqual({ closed: false, remaining: [lbEndpoint] });
  });
});

describe('closePublicEndpoints', () => {
  /** Each `getInstance` answers the next read; the last one repeats. */
  function effects(reads: RdbInstance[]) {
    const steps: string[] = [];
    const fx: CloseEndpointsEffects = {
      getInstance: async () => {
        steps.push('read');
        return reads.length > 1 ? (reads.shift() as RdbInstance) : (reads[0] as RdbInstance);
      },
      deleteEndpoint: async (id) => {
        steps.push(`delete:${id}`);
      },
      sleep: async () => {},
      log: () => {},
    };
    return { fx, steps };
  }

  it('deletes the public endpoint once the instance is ready, then re-reads until it shows none', async () => {
    const { fx, steps } = effects([
      instance('configuring', [privateEndpoint, lbEndpoint]),
      instance('ready', [privateEndpoint, lbEndpoint]),
      instance('configuring', [privateEndpoint, lbEndpoint]),
      instance('ready', [privateEndpoint]),
    ]);
    await expect(closePublicEndpoints(fx, { intervalMs: 0 })).resolves.toEqual({ deleted: ['51.158.210.62:6317'] });
    expect(steps).toEqual(['read', 'read', 'delete:ep-lb', 'read', 'read']);
  });

  it('deletes nothing on a private-only instance and confirms it', async () => {
    const { fx, steps } = effects([instance('ready', [privateEndpoint])]);
    await expect(closePublicEndpoints(fx)).resolves.toEqual({ deleted: [] });
    expect(steps).toEqual(['read', 'read']);
  });

  it('fails when the endpoint is still listed after the polling budget', async () => {
    const { fx } = effects([instance('ready', [privateEndpoint, lbEndpoint])]);
    await expect(closePublicEndpoints(fx, { attempts: 3, intervalMs: 0 })).rejects.toThrow(
      /'ready' with public endpoint\(s\) 51\.158\.210\.62:6317 left/,
    );
  });

  it('deletes nothing while the instance never becomes ready', async () => {
    const { fx, steps } = effects([instance('backuping', [privateEndpoint, lbEndpoint])]);
    await expect(closePublicEndpoints(fx, { attempts: 2, intervalMs: 0 })).rejects.toThrow(/stays 'backuping', so no endpoint was deleted/);
    expect(steps.some((step) => step.startsWith('delete'))).toBe(false);
  });
});
