import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeDeep } from './utils.ts';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

async function loadAppConfig(env: Record<string, string>) {
  vi.resetModules();
  process.env = { ...originalEnv, ...env };
  return (await import('./app-config.ts')).appConfig;
}

describe('mergeDeep', () => {
  it('replaces an array, never merges it: a mode override lists its values in full', () => {
    expect(mergeDeep({ list: [1, 2, 3], nested: { kept: true } }, { list: [9] })).toEqual({ list: [9], nested: { kept: true } });
  });
});

describe('appConfig service endpoints', () => {
  it('derives service public URLs from the compatibility URL fields', async () => {
    const appConfig = await loadAppConfig({ APP_MODE: 'development' });
    expect(appConfig.services.frontend.publicUrl).toBe(appConfig.frontendUrl);
    expect(appConfig.services.backend.publicUrl).toBe(appConfig.backendUrl);
    expect(appConfig.services.yjs.publicUrl).toBe(appConfig.yjsUrl);
    expect(appConfig.services.mcp.publicUrl).toBe(appConfig.mcpUrl);
    expect('publicUrl' in appConfig.services.cdc).toBe(false);
  });

  it('applies env URL overrides to service public URLs', async () => {
    const appConfig = await loadAppConfig({
      APP_MODE: 'production',
      FRONTEND_URL: 'https://front.example',
      BACKEND_URL: 'https://api.example',
      YJS_URL: 'wss://yjs.example',
      MCP_URL: 'https://mcp.example',
    });
    expect(appConfig.services.frontend.publicUrl).toBe('https://front.example');
    expect(appConfig.services.backend.publicUrl).toBe('https://api.example');
    expect(appConfig.services.yjs.publicUrl).toBe('wss://yjs.example');
    expect(appConfig.services.mcp.publicUrl).toBe('https://mcp.example');
  });
});

describe('appConfig service dependencies', () => {
  const stagingServices = (services: Record<string, { enabled: boolean }>) =>
    vi.doMock('../../config/config.staging.ts', async (original) => {
      const { staging } = await original<typeof import('../../config/config.staging.ts')>();
      return { staging: { ...staging, services } };
    });

  afterEach(() => vi.doUnmock('../../config/config.staging.ts'));

  it('refuses MCP without the authorization server, also when another mode is the one running', async () => {
    stagingServices({ mcp: { enabled: true }, oauth: { enabled: false } });
    await expect(loadAppConfig({ APP_MODE: 'development' })).rejects.toThrow(/services\.mcp is enabled in staging mode while services\.oauth is off/);
  });

  it('accepts MCP with the authorization server on', async () => {
    stagingServices({ mcp: { enabled: true }, oauth: { enabled: true } });
    expect((await loadAppConfig({ APP_MODE: 'staging' })).services.mcp.enabled).toBe(true);
  });
});

describe('appConfig devAppIndex', () => {
  const useIndex = (devAppIndex: number) =>
    vi.doMock('../../config/config.default.ts', async (original) => {
      const { config } = await original<typeof import('../../config/config.default.ts')>();
      return { config: { ...config, devAppIndex } };
    });

  afterEach(() => vi.doUnmock('../../config/config.default.ts'));

  it('moves the frontend and its URLs by one, the services by ten and leaves production alone', async () => {
    const base = await loadAppConfig({ APP_MODE: 'development', DEV_PORT_OFFSET: '0' });
    const baseProduction = await loadAppConfig({ APP_MODE: 'production' });
    useIndex(2);
    const app = await loadAppConfig({ APP_MODE: 'development', DEV_PORT_OFFSET: '0' });
    expect(app.devPorts.frontend).toBe(base.devPorts.frontend + 2);
    expect(new URL(app.frontendUrl).port).toBe(String(Number(new URL(base.frontendUrl).port) + 2));
    expect(new URL(app.yjsUrl).port).toBe(new URL(app.frontendUrl).port);
    expect(app.devPorts.api).toBe(base.devPorts.api + 20);
    expect(app.devPorts.jobs).toBe(base.devPorts.jobs + 20);
    const worktree = await loadAppConfig({ APP_MODE: 'development', DEV_PORT_OFFSET: '100' });
    expect(worktree.devPorts.api).toBe(base.devPorts.api + 120);
    expect((await loadAppConfig({ APP_MODE: 'production' })).devPorts).toEqual(baseProduction.devPorts);
  });

  it.each([
    ['index 4', { index: 4, offset: '0' }],
    ['the hand offset of 40', { index: 0, offset: '40' }],
    ['index 9 in the first worktree block', { index: 9, offset: '100' }],
  ])('refuses a port that fetch refuses: %s', async (_, { index, offset }) => {
    useIndex(index);
    await expect(loadAppConfig({ APP_MODE: 'development', DEV_PORT_OFFSET: offset })).rejects.toThrow(/one fetch refuses/);
  });

  it('refuses an index outside 0-9', async () => {
    useIndex(10);
    await expect(loadAppConfig({ APP_MODE: 'development', DEV_PORT_OFFSET: '0' })).rejects.toThrow(/Invalid config devAppIndex/);
  });
});

describe('appConfig dev port offset', () => {
  const port = (url: string) => Number(new URL(url).port);

  it('moves devPorts and the localhost URL family together', async () => {
    const base = await loadAppConfig({ APP_MODE: 'development', DEV_PORT_OFFSET: '0' });
    const shifted = await loadAppConfig({ APP_MODE: 'development', DEV_PORT_OFFSET: '100' });
    expect(shifted.devPortOffset).toBe(100);
    expect(shifted.devPorts.api).toBe(base.devPorts.api + 100);
    expect(shifted.devPorts.internal).toBe(base.devPorts.internal + 100);
    expect(port(shifted.frontendUrl)).toBe(port(base.frontendUrl) + 100);
    expect(port(shifted.backendUrl)).toBe(port(base.backendUrl) + 100);
    expect(port(shifted.yjsUrl)).toBe(port(base.yjsUrl) + 100);
    expect(shifted.services.frontend.publicUrl).toBe(shifted.frontendUrl);
  });

  it('writes generated text with the configured ports', async () => {
    const base = await loadAppConfig({ APP_MODE: 'development', DEV_PORT_OFFSET: '0' });
    process.env = { ...originalEnv, APP_MODE: 'development', DEV_PORT_OFFSET: '100' };
    vi.resetModules();
    const { appConfig, withConfiguredDevPorts } = await import('./app-config.ts');
    expect(appConfig.backendUrl).not.toBe(base.backendUrl);
    expect(withConfiguredDevPorts(`{"url":"${appConfig.backendUrl}"}`)).toBe(`{"url":"${base.backendUrl}"}`);
  });

  it('leaves an env URL override and the other modes unshifted', async () => {
    const overridden = await loadAppConfig({ APP_MODE: 'development', DEV_PORT_OFFSET: '100', FRONTEND_URL: 'http://localhost:3000' });
    expect(overridden.frontendUrl).toBe('http://localhost:3000');
    expect((await loadAppConfig({ APP_MODE: 'production', DEV_PORT_OFFSET: '100' })).devPortOffset).toBe(0);
    expect((await loadAppConfig({ APP_MODE: 'test', DEV_PORT_OFFSET: '100' })).devPortOffset).toBe(0);
  });
});
