import { beforeAll, describe, expect, it } from 'vitest';
import { installPulumiMocks, type MockHarness } from '../tests/helpers/pulumi-mock';

let h: MockHarness;

beforeAll(async () => {
  h = await installPulumiMocks({ deferCompute: true });
  await import('./network');
  await h.settle();
});

describe('network module', () => {
  it('private network is scoped to an RFC1918 IPv4 range', () => {
    const pn = h.resources.find((r) => /privateNetwork/i.test(r.type));
    expect(pn).toBeDefined();
    const subnet = (pn!.inputs.ipv4Subnet as any)?.subnet as string;
    expect(subnet).toMatch(/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/);
  });
});
