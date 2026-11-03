import { describe, expect, it } from 'vitest';
import { fakeConfig } from '../../tests/helpers/fake-config';
import { makeFetch } from '../../tests/helpers/fake-fetch';
import type { MachineRole } from '../machine-roles';
import { deriveInfra } from '../naming';
import { servicesByName } from '../services';
import { readSlotAddresses } from './foundation';

const backend = servicesByName.get('backend');
const role = {
  role: 'backend',
  services: backend ? [backend] : [],
  pools: [{ key: 'backend', service: 'backend', port: 4000 }],
  strategy: 'start-first',
  drainSeconds: 10,
  primary: true,
} satisfies MachineRole;
const { naming } = deriveInfra(fakeConfig());

describe("the reserved addresses a deploy finds the apply's slots by", () => {
  it('asks IPAM for the tag the apply gave each slot and strips the CIDR suffix; a slot not reserved yet is absent', async () => {
    const { fn, calls } = makeFetch([
      { method: 'GET', match: 'tags=cella-production-backend-a', body: { ips: [{ id: 'ip-a', address: '10.0.0.7/24' }] } },
      { method: 'GET', match: 'tags=cella-production-backend-b', body: { ips: [] } },
    ]);
    const slots = await readSlotAddresses(
      { secretKey: 'test', fetchImpl: fn },
      { region: 'nl-ams', projectId: 'p', naming, mode: 'production', roles: [role] },
    );
    expect(slots).toEqual({ backend: { a: { id: 'ip-a', address: '10.0.0.7' } } });
    expect(calls.map((call) => call.url)).toEqual([
      'https://api.scaleway.com/ipam/v1/regions/nl-ams/ips?project_id=p&tags=cella-production-backend-a&is_ipv6=false',
      'https://api.scaleway.com/ipam/v1/regions/nl-ams/ips?project_id=p&tags=cella-production-backend-b&is_ipv6=false',
    ]);
  });
});
