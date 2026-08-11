import { describe, expect, it } from 'vitest';
import { redisManaged } from './redis-managed';

const base = { version: '7.0.5', nodeType: 'RED1-MICRO' };

describe('redisManaged store', () => {
  it('contributes url + ca secrets when consumers are declared (tls on by default)', () => {
    const secrets = redisManaged({ ...base, secretConsumers: { url: ['api'], ca: ['api'] } }).secrets?.() ?? [];
    expect(secrets.map((s) => s.id)).toEqual(['redisUrl', 'redisSslCa']);
    expect(secrets[0]).toMatchObject({ envVar: 'REDIS_URL', valueSource: 'pulumi', required: true });
  });

  it('omits the ca contribution when tls is disabled', () => {
    const secrets = redisManaged({ ...base, tls: false, secretConsumers: { url: ['api'] } }).secrets?.() ?? [];
    expect(secrets.map((s) => s.id)).toEqual(['redisUrl']);
  });

  it('declares no secrets without consumers', () => {
    expect(redisManaged(base).secrets?.()).toEqual([]);
  });

  it('validate refuses ca consumers with tls disabled (would silently emit no CA secret)', () => {
    const store = redisManaged({ ...base, tls: false, secretConsumers: { url: ['api'], ca: ['api'] } });
    expect(() => store.validate?.()).toThrow(/tls is disabled/);
  });

  it('validate passes for the default TLS posture', () => {
    const store = redisManaged({ ...base, secretConsumers: { url: ['api'], ca: ['api'] } });
    expect(() => store.validate?.()).not.toThrow();
  });
});
