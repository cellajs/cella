import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FederationConfig } from './types.ts';
import { mergeDeep } from './utils.ts';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

async function loadAppConfig(env: Record<string, string>) {
  vi.resetModules();
  process.env = { ...originalEnv, APP_ORIGIN: '', ...env };
  return (await import('./app-config.ts')).appConfig;
}

describe('mergeDeep', () => {
  it('replaces an array, never merges it: a mode override lists its values in full', () => {
    expect(mergeDeep({ list: [1, 2, 3], nested: { kept: true } }, { list: [9] })).toEqual({ list: [9], nested: { kept: true } });
  });
});

describe('appConfig service endpoints', () => {
  it('derives every service URL and public URL from the origin', async () => {
    const appConfig = await loadAppConfig({ APP_MODE: 'production' });
    const { origin } = appConfig;
    expect(appConfig.frontendUrl).toBe(origin);
    expect(appConfig.backendUrl).toBe(`${origin}/api`);
    expect(appConfig.backendAuthUrl).toBe(`${origin}/api/auth`);
    expect(appConfig.yjsUrl).toBe(`${origin.replace('https', 'wss')}/yjs`);
    expect(appConfig.mcpUrl).toBe(`${origin}/mcp`);
    expect(appConfig.oauthUrl).toBe(`${origin}/oauth`);
    expect(appConfig.services.frontend.publicUrl).toBe(appConfig.frontendUrl);
    expect(appConfig.services.backend.publicUrl).toBe(appConfig.backendUrl);
    expect(appConfig.services.yjs.publicUrl).toBe(appConfig.yjsUrl);
    expect(appConfig.services.mcp.publicUrl).toBe(appConfig.mcpUrl);
    expect('publicUrl' in appConfig.services.cdc).toBe(false);
  });

  it('takes the origin from APP_ORIGIN, for a build or a container served elsewhere', async () => {
    const appConfig = await loadAppConfig({ APP_MODE: 'production', APP_ORIGIN: 'https://app.example' });
    expect(appConfig.services.frontend.publicUrl).toBe('https://app.example');
    expect(appConfig.services.backend.publicUrl).toBe('https://app.example/api');
    expect(appConfig.services.yjs.publicUrl).toBe('wss://app.example/yjs');
  });

  it('tells a local stack from a deployed one', async () => {
    for (const mode of ['development', 'tunnel', 'test'] as const) expect((await loadAppConfig({ APP_MODE: mode })).isLocal).toBe(true);
    for (const mode of ['staging', 'production'] as const) expect((await loadAppConfig({ APP_MODE: mode })).isDeployed).toBe(true);
  });
});

describe('appConfig federations', () => {
  it('signs in through a federation sandbox in every mode but production', async () => {
    const production: Record<string, FederationConfig> = (await loadAppConfig({ APP_MODE: 'production' })).federations;
    for (const [key, federation] of Object.entries(production)) {
      if (!federation.sandbox) continue;
      for (const mode of ['development', 'tunnel', 'staging', 'test'] as const) {
        const federations: Record<string, FederationConfig> = (await loadAppConfig({ APP_MODE: mode })).federations;
        const built = federations[key];
        expect(built.issuer, `${key} in ${mode}`).toBe(federation.sandbox.issuer);
        expect(built.idpMetadataUrl, `${key} in ${mode}`).toBe(federation.sandbox.idpMetadataUrl);
      }
    }
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

  it('moves the frontend and its origin by one, the services by ten and leaves production alone', async () => {
    useIndex(0); // An app's own number would otherwise count twice
    const base = await loadAppConfig({ APP_MODE: 'development', DEV_PORT_OFFSET: '0' });
    const baseProduction = await loadAppConfig({ APP_MODE: 'production' });
    useIndex(2);
    const app = await loadAppConfig({ APP_MODE: 'development', DEV_PORT_OFFSET: '0' });
    expect(app.services.frontend.port).toBe(base.services.frontend.port + 2);
    expect(new URL(app.frontendUrl).port).toBe(String(Number(new URL(base.frontendUrl).port) + 2));
    expect(new URL(app.yjsUrl).port).toBe(new URL(app.frontendUrl).port);
    expect(app.services.backend.port).toBe(base.services.backend.port + 20);
    expect(app.services.backend.internalPort).toBe(base.services.backend.internalPort + 20);
    expect(app.services.jobs.port).toBe(base.services.jobs.port + 20);
    const worktree = await loadAppConfig({ APP_MODE: 'development', DEV_PORT_OFFSET: '100' });
    expect(worktree.services.backend.port).toBe(base.services.backend.port + 120);
    expect((await loadAppConfig({ APP_MODE: 'production' })).services).toEqual(baseProduction.services);
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

  it('moves the service ports and the localhost origin together', async () => {
    const base = await loadAppConfig({ APP_MODE: 'development', DEV_PORT_OFFSET: '0' });
    const shifted = await loadAppConfig({ APP_MODE: 'development', DEV_PORT_OFFSET: '100' });
    expect(shifted.devPortOffset).toBe(100);
    expect(shifted.services.backend.port).toBe(base.services.backend.port + 100);
    expect(shifted.services.backend.internalPort).toBe(base.services.backend.internalPort + 100);
    expect(port(shifted.frontendUrl)).toBe(port(base.frontendUrl) + 100);
    expect(port(shifted.backendUrl)).toBe(port(base.backendUrl) + 100);
    expect(port(shifted.yjsUrl)).toBe(port(base.yjsUrl) + 100);
    expect(shifted.services.frontend.publicUrl).toBe(shifted.frontendUrl);
  });

  it('writes generated text with the configured ports', async () => {
    const base = await loadAppConfig({ APP_MODE: 'development', DEV_PORT_OFFSET: '0' });
    process.env = { ...originalEnv, APP_ORIGIN: '', APP_MODE: 'development', DEV_PORT_OFFSET: '100' };
    vi.resetModules();
    const { appConfig, withConfiguredDevPorts } = await import('./app-config.ts');
    expect(appConfig.backendUrl).not.toBe(base.backendUrl);
    expect(withConfiguredDevPorts(`{"url":"${appConfig.backendUrl}"}`)).toBe(`{"url":"${base.backendUrl}"}`);
  });

  it('leaves an env origin override and the other modes unshifted', async () => {
    const overridden = await loadAppConfig({ APP_MODE: 'development', DEV_PORT_OFFSET: '100', APP_ORIGIN: 'http://localhost:3000' });
    expect(overridden.frontendUrl).toBe('http://localhost:3000');
    expect((await loadAppConfig({ APP_MODE: 'production', DEV_PORT_OFFSET: '100' })).devPortOffset).toBe(0);
    expect((await loadAppConfig({ APP_MODE: 'test', DEV_PORT_OFFSET: '100' })).devPortOffset).toBe(0);
  });
});
