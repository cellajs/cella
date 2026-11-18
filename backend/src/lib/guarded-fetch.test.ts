import { appConfig, type ConfigMode } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type GuardedTransport, guardedFetch, type ResolvedAddress } from '#/lib/guarded-fetch';

const testMode = appConfig.mode;
afterEach(() => Reflect.set(appConfig, 'mode', testMode));

const ipv4 = (address: string): ResolvedAddress => ({ address, family: 4 });
const ipv6 = (address: string): ResolvedAddress => ({ address, family: 6 });
const publicAddress = ipv4('1.1.1.1');

interface Case {
  name: string;
  url?: string;
  addresses?: ResolvedAddress[];
  answer?: () => Response;
  mode?: ConfigMode;
  refusal: 'outbound_request_refused' | 'outbound_request_failed';
}

// An attacker who supplies the address aims the backend at the network it runs in: every row must be refused.
const cases: Case[] = [
  { name: 'a private IPv4 address', addresses: [ipv4('10.0.0.5')], refusal: 'outbound_request_refused' },
  { name: 'loopback outside development', addresses: [ipv4('127.0.0.1')], mode: 'production', refusal: 'outbound_request_refused' },
  { name: 'the link-local metadata address', addresses: [ipv4('169.254.169.254')], refusal: 'outbound_request_refused' },
  { name: 'a unique-local IPv6 address', addresses: [ipv6('fd12:3456::1')], refusal: 'outbound_request_refused' },
  { name: 'an IPv4-mapped private address', addresses: [ipv6('::ffff:192.168.1.1')], refusal: 'outbound_request_refused' },
  { name: 'an IPv4-mapped address in hex', addresses: [ipv6('::ffff:a9fe:a9fe')], refusal: 'outbound_request_refused' },
  { name: 'a private address literal', url: 'https://[fd00::1]/configuration', refusal: 'outbound_request_refused' },
  { name: 'a host with one public and one private address', addresses: [publicAddress, ipv4('10.0.0.5')], refusal: 'outbound_request_refused' },
  {
    name: 'a redirect',
    answer: () => new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/' } }),
    refusal: 'outbound_request_refused',
  },
  { name: 'an oversized body', answer: () => new Response('x'.repeat(300 * 1024)), refusal: 'outbound_request_failed' },
  {
    name: 'plain HTTP outside development',
    url: 'http://platform.example.edu/configuration',
    mode: 'production',
    refusal: 'outbound_request_refused',
  },
];

describe('guardedFetch', () => {
  it.each(cases)(
    'refuses $name',
    async ({ url = 'https://platform.example.edu/configuration', addresses = [publicAddress], answer, mode, refusal }) => {
      if (mode) Reflect.set(appConfig, 'mode', mode);
      const transport = vi.fn<GuardedTransport>(async () => (answer ? answer() : new Response('{}')));

      await expect(guardedFetch(url, { resolve: async () => addresses, transport })).rejects.toMatchObject({ type: refusal });
      // A refused address is never connected to.
      if (!answer) expect(transport).not.toHaveBeenCalled();
    },
  );

  it('connects to the vetted address, without resolving the host again', async () => {
    const transport = vi.fn<GuardedTransport>(async () => new Response('{"ok":true}'));

    const response = await guardedFetch('https://platform.example.edu/configuration', { resolve: async () => [publicAddress], transport });

    expect(response.text).toBe('{"ok":true}');
    expect(transport.mock.calls[0][0]).toMatchObject({ target: publicAddress, url: new URL('https://platform.example.edu/configuration') });
  });
});
