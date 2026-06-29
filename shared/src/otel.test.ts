import { describe, expect, it, vi } from 'vitest';
import { createOtelSDK } from './otel';

describe('createOtelSDK', () => {
  it('creates meterProvider without Maple key', () => {
    const otel = createOtelSDK({ serviceName: 'test-service' });

    expect(otel.meterProvider).toBeDefined();
    expect(otel.sdk).toBeUndefined();
  });

  it('creates sdk when spanProcessors are provided (no Maple key)', () => {
    const mockProcessor = {
      onStart: vi.fn(),
      onEnd: vi.fn(),
      forceFlush: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };

    const otel = createOtelSDK({
      serviceName: 'test-service',
      spanProcessors: [mockProcessor],
      autoInstrumentations: false,
    });

    expect(otel.sdk).toBeDefined();
  });

  it('does not create sdk without Maple key or spanProcessors', () => {
    const otel = createOtelSDK({ serviceName: 'test-service' });
    expect(otel.sdk).toBeUndefined();
  });

  it('start does not throw when sdk is undefined', () => {
    const otel = createOtelSDK({ serviceName: 'test-service' });
    expect(() => otel.start()).not.toThrow();
  });

  it('shutdown does not throw when sdk is undefined', async () => {
    const otel = createOtelSDK({ serviceName: 'test-service' });
    await expect(otel.shutdown()).resolves.toBeUndefined();
  });

  it('verifyConnection logs skip message when no Maple key', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const otel = createOtelSDK({ serviceName: 'test-svc' });

    await otel.verifyConnection();

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('MAPLE_SECRET_INGEST_KEY not set'));
    spy.mockRestore();
  });
});
