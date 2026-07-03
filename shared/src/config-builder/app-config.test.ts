import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

async function loadAppConfig(env: Record<string, string>) {
  vi.resetModules();
  process.env = { ...originalEnv, ...env };
  return (await import('./app-config')).appConfig;
}

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
      MCP_API_URL: 'https://mcp.example',
    });
    expect(appConfig.services.frontend.publicUrl).toBe('https://front.example');
    expect(appConfig.services.backend.publicUrl).toBe('https://api.example');
    expect(appConfig.services.yjs.publicUrl).toBe('wss://yjs.example');
    expect(appConfig.services.mcp.publicUrl).toBe('https://mcp.example');
  });

  it('loads service enablement from mode config overrides', async () => {
    const appConfig = await loadAppConfig({ APP_MODE: 'test' });
    expect(appConfig.services.cdc.enabled).toBe(true);
    expect(appConfig.services.yjs.enabled).toBe(true);
    expect(appConfig.services.mcp.enabled).toBe(false);
  });
});