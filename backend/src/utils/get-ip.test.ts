import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';
import { getIp } from '#/utils/get-ip';

/** Minimal Context stub exposing only what getIp reads (headers + socket peer). */
const makeCtx = (headers: Record<string, string>, remoteAddress?: string): Context =>
  ({
    req: { header: (name: string) => headers[name.toLowerCase()] },
    env: { incoming: { socket: { remoteAddress } } },
  }) as unknown as Context;

describe('getIp', () => {
  it('returns the right-most X-Forwarded-For entry (client appended by the trusted single-hop LB)', () => {
    const ctx = makeCtx({ 'x-forwarded-for': '1.2.3.4, 9.9.9.9' }, '10.0.0.1');
    expect(getIp(ctx)).toBe('9.9.9.9');
  });

  it('ignores forged left-most entries', () => {
    const ctx = makeCtx({ 'x-forwarded-for': 'evil-spoof, 6.6.6.6, 8.8.8.8' }, '10.0.0.1');
    expect(getIp(ctx)).toBe('8.8.8.8');
  });

  it('falls back to the socket peer when no XFF header is present', () => {
    const ctx = makeCtx({}, '10.0.0.1');
    expect(getIp(ctx)).toBe('10.0.0.1');
  });

  it('does not trust X-Real-IP (spoofable, dropped)', () => {
    const ctx = makeCtx({ 'x-real-ip': '7.7.7.7' }, '10.0.0.1');
    expect(getIp(ctx)).toBe('10.0.0.1');
  });

  it('trims whitespace and skips empty entries', () => {
    const ctx = makeCtx({ 'x-forwarded-for': '1.1.1.1,  , 2.2.2.2 ' }, '10.0.0.1');
    expect(getIp(ctx)).toBe('2.2.2.2');
  });

  it('returns null when there is neither an XFF header nor a socket peer', () => {
    const ctx = makeCtx({}, undefined);
    expect(getIp(ctx)).toBeNull();
  });
});
