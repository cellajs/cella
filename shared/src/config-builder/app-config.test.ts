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
    expect(mergeDeep({ list: [1, 2, 3], nested: { kept: true } }, { list: [9] })).toEqual({
      list: [9],
      nested: { kept: true },
    });
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
