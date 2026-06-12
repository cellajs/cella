import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

describe('release smoke', () => {
  const workspaceRoot = resolve(import.meta.dirname, '../../..');
  const packageRoot = resolve(import.meta.dirname, '..');
  const tempRoot = mkdtempSync(join(tmpdir(), 'create-cella-release-'));
  const targetFolder = join(tempRoot, 'smoke-app');

  afterAll(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('creates a project with slug and offset propagated into backend env and dev config', () => {
    execFileSync(
      'node',
      [
        'index.js',
        targetFolder,
        '--template',
        workspaceRoot,
        '--port-offset',
        '10',
        '--admin-email',
        'admin@smoke-app.com',
      ],
      {
        cwd: packageRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          CREATE_CELLA_SKIP_INSTALL: 'true',
          CREATE_CELLA_SKIP_GENERATE: 'true',
          CREATE_CELLA_SKIP_GIT: 'true',
          CREATE_CELLA_SKIP_REMOTE: 'true',
        },
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    const backendEnvPath = join(targetFolder, 'backend', '.env');
    const developmentConfigPath = join(targetFolder, 'shared', 'config', 'config.development.ts');

    expect(existsSync(backendEnvPath)).toBe(true);
    expect(existsSync(developmentConfigPath)).toBe(true);

    const backendEnv = readFileSync(backendEnvPath, 'utf8');
    const developmentConfig = readFileSync(developmentConfigPath, 'utf8');

    expect(backendEnv).toContain('PROJECT_SLUG=smoke-app');
    expect(backendEnv).toContain('DB_PORT=5442');
    expect(backendEnv).toContain('DB_TEST_PORT=5444');
    expect(backendEnv).toContain('DATABASE_URL=postgres://runtime_role:dev_password@0.0.0.0:5442/postgres');
    expect(backendEnv).toContain('ADMIN_EMAIL=admin@smoke-app.com');
    expect(backendEnv).toContain('PORT=4010');

    expect(developmentConfig).toContain("slug: 'smoke-app-development'");
    expect(developmentConfig).toContain("frontendUrl: 'http://localhost:3010'");
    expect(developmentConfig).toContain("backendUrl: 'http://localhost:4010'");
    expect(developmentConfig).toContain("backendAuthUrl: 'http://localhost:4010/auth'");
  }, 240000);
});
