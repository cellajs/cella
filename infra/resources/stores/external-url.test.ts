import { describe, expect, it } from 'vitest';
import type { ProvisionContext } from '../../lib/stores';
import { externalUrl, mongoUrl, redisUrl } from './external-url';
import { redisManaged } from './redis-managed';

// External stores ignore the provision context entirely; an empty stub satisfies the call.
const ctx = {} as ProvisionContext;

describe('external URL stores', () => {
  it('redisUrl contributes an operator REDIS_URL with defaults', () => {
    const store = redisUrl({ services: ['api'] });
    expect(store.kind).toBe('redis-url');
    expect(store.provision(ctx)).toEqual({ outputs: {}, secretValues: {} });
    expect(store.secrets?.()).toEqual([
      {
        id: 'redisUrl',
        secretName: 'redis-url',
        envVar: 'REDIS_URL',
        description: 'External Redis connection URL (operator-supplied)',
        required: true,
        valueSource: 'operator',
        services: ['api'],
      },
    ]);
  });

  it('mongoUrl contributes an operator MONGO_URL', () => {
    const secrets = mongoUrl({ services: ['api', 'worker'] }).secrets?.() ?? [];
    expect(secrets[0]).toMatchObject({
      id: 'mongoUrl',
      envVar: 'MONGO_URL',
      secretName: 'mongo-url',
      services: ['api', 'worker'],
    });
  });

  it('externalUrl honors per-app overrides', () => {
    const store = externalUrl(
      { kind: 'nats-url', id: 'natsUrl', secretName: 'nats-url', envVar: 'NATS_URL', description: 'External NATS URL' },
      { services: ['worker'], required: false, envVar: 'QUEUE_URL' },
    );
    expect(store.secrets?.()[0]).toMatchObject({ id: 'natsUrl', envVar: 'QUEUE_URL', required: false });
  });
});

describe('redisManaged secret contributions', () => {
  it('declares url and ca secrets from consumer config', () => {
    const store = redisManaged({
      version: '7.0.5',
      nodeType: 'RED1-MICRO',
      secretConsumers: { url: ['api'], ca: ['api'] },
    });
    expect(store.secrets?.().map((secret) => secret.id)).toEqual(['redisUrl', 'redisSslCa']);
  });

  it('omits the ca contribution without tls and declares nothing without consumers', () => {
    const noTls = redisManaged({
      version: '7.0.5',
      nodeType: 'RED1-MICRO',
      tls: false,
      secretConsumers: { url: ['api'], ca: ['api'] },
    });
    expect(noTls.secrets?.().map((secret) => secret.id)).toEqual(['redisUrl']);
    const silent = redisManaged({ version: '7.0.5', nodeType: 'RED1-MICRO' });
    expect(silent.secrets?.()).toEqual([]);
  });
});
