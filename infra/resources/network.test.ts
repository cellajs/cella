import { beforeAll, describe, expect, it } from 'vitest';
import { flushPulumi, installPulumiMocks, type MockHarness } from '../tests/helpers/pulumi-mock';

let h: MockHarness;

beforeAll(async () => {
  // bootstrap:computeDeferred gates compute off, which keeps the
  // image-tag pin assertion in pulumi-context.ts from firing in unit tests that
  // don't care about compute.
  h = await installPulumiMocks({ stack: 'production', config: { 'bootstrap:computeDeferred': 'test' } });
  await import('./network');
  await flushPulumi();
});

describe('network module', () => {
  it('private network is scoped to an RFC1918 IPv4 range', () => {
    const pn = h.resources.find((r) => /privateNetwork/i.test(r.type));
    expect(pn).toBeDefined();
    const subnet = (pn!.inputs.ipv4Subnet as any)?.subnet as string;
    expect(subnet).toMatch(/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/);
  });
});
