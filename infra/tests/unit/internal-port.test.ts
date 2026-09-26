import { describe, expect, it } from 'vitest';
import { composeConfig } from '../../compose/compose';
import { defineServices } from '../../compose/infrastructure';
import { appServices } from '../../config/services.config';
import { services } from '../../lib/services';
import { internalLbPort } from '../../resources/lb-internal';

/** Minimal valid service entry to hang port variations on. */
const base = {
  image: 'r/x:latest',
  port: 4000,
  healthTimeoutSeconds: 60,
  startPeriod: '10s',
  replacementStrategy: 'start-first',
  instanceType: 'DEV1-S',
} as const;

// The backend's server-to-server routes (the CDC socket, the Yjs relay's materialize) listen on a port of their own,
// which only the private ACL-guarded LB pool forwards to; the public pools forward the app port alone.
describe('internal listener routing', () => {
  it('gives the backend an internal listener on a port no public pool forwards to', () => {
    const withInternal = services.filter((s) => s.internalPort !== undefined);
    expect(withInternal.map((s) => s.slug)).toEqual(['backend']);
    const internalPort = withInternal[0]?.internalPort;
    for (const service of services) expect(service.healthPort, service.slug).not.toBe(internalPort);
  });

  it('publishes the internal listener and tells the backend its port', () => {
    const backend = composeConfig.services.backend;
    expect(backend?.ports).toContain('4005:4005');
    expect(backend?.environment?.INTERNAL_PORT).toBe('4005');
  });

  it('must not let the cdc or yjs worker reach the backend through its public URL', () => {
    expect(appServices.cdc.bindings).toEqual({
      API_WS_URL: 'ws://@{backend.internalHost}:@{backend.internalPort}/internal/cdc',
    });
    expect(appServices.yjs.bindings).toEqual({
      BACKEND_INTERNAL_URL: 'http://@{backend.internalHost}:@{backend.internalPort}',
    });
  });

  it('must not accept an internal listener that shares a port with any service', () => {
    expect(() => defineServices({ a: { ...base, internalPort: 4000 } })).toThrow(/port of its own/);
    expect(() => defineServices({ a: { ...base, internalPort: 4005 }, b: { ...base, port: 4005 } })).toThrow(
      /port of its own/,
    );
    expect(() =>
      defineServices({ a: { ...base, internalPort: 4005 }, b: { ...base, port: 4001, internalPort: 4005 } }),
    ).toThrow(/port of its own/);
    expect(() => defineServices({ a: { ...base, internalPort: 70000 } })).toThrow(/not a valid port/);
    // Positive control: a port of its own passes.
    expect(() => defineServices({ a: { ...base, internalPort: 4005 }, b: { ...base, port: 4001 } })).not.toThrow();
  });

  it('shifts the internal listener port into the internal frontend range', () => {
    expect(internalLbPort(4005)).toBe(14005);
  });
});
