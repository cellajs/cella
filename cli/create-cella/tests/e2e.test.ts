import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { create } from '#/create';

/**
 * E2E test for create-cella CLI.
 *
 * Scaffolds a project from the LOCAL checkout (not the github remote), so the placeholder
 * config template is validated against the local backend/frontend/shared in the same PR -
 * no remote drift, no network. This keeps the test deterministic and CI-safe.
 *
 * By default install + generate are skipped (fast scaffold-only run) and the scaffolding,
 * env interpolation and git wiring are asserted. Set `CREATE_CELLA_E2E_FULL=true` to run the
 * heavy path that also installs deps, generates migrations and type-checks the scaffold.
 */
const FULL = process.env.CREATE_CELLA_E2E_FULL === 'true';

describe('create-cella e2e', () => {
  const repoRoot = resolve(import.meta.dirname, '../../..');
  const projectName = `cella-e2e-test-${Date.now()}`;
  const targetFolder = join(tmpdir(), projectName);

  beforeAll(
    async () => {
      // Create a full project with all steps
      await create({
        projectName,
        targetFolder,
        packageManager: 'pnpm',
        portOffset: 0,
        templateUrl: repoRoot,
        skipInstall: !FULL,
        silent: true,
      });
    },
    FULL ? 600000 : 120000,
  ); // FULL also copies the repo + runs pnpm install/generate

  afterAll(() => {
    // Cleanup
    if (existsSync(targetFolder)) {
      rmSync(targetFolder, { recursive: true, force: true });
    }
  }, 60000); // Removing node_modules can take a while

  describe('project structure', () => {
    it('should create essential directories', () => {
      expect(existsSync(join(targetFolder, 'backend'))).toBe(true);
      expect(existsSync(join(targetFolder, 'frontend'))).toBe(true);
      expect(existsSync(join(targetFolder, 'shared'))).toBe(true);
      expect(existsSync(join(targetFolder, 'locales'))).toBe(true);
    });

    it.skipIf(!FULL)('should have node_modules installed', () => {
      expect(existsSync(join(targetFolder, 'node_modules'))).toBe(true);
      expect(existsSync(join(targetFolder, 'backend', 'node_modules'))).toBe(true);
      expect(existsSync(join(targetFolder, 'frontend', 'node_modules'))).toBe(true);
    });
  });

  describe('README.md (from QUICKSTART)', () => {
    it('should have README.md with quickstart content', () => {
      const readmePath = join(targetFolder, 'README.md');
      expect(existsSync(readmePath)).toBe(true);

      const content = readFileSync(readmePath, 'utf-8');
      // Check for QUICKSTART.md content markers
      expect(content).toContain('# Quickstart');
      expect(content).toContain('pnpm docker');
      expect(content).toContain('pnpm dev');
    });
  });

  describe('.env files', () => {
    it('should not have a root .env file', () => {
      // The root .env was removed; backend/.env is now the single source of truth.
      expect(existsSync(join(targetFolder, '.env'))).toBe(false);
    });

    it('should have backend .env with project slug, ports and admin email', () => {
      const envPath = join(targetFolder, 'backend', '.env');
      expect(existsSync(envPath)).toBe(true);

      const content = readFileSync(envPath, 'utf-8');
      // Docker compose variables (backend/.env is the single source of truth)
      expect(content).toContain(`PROJECT_SLUG=${projectName}`);
      expect(content).toContain('DB_PORT=5432');
      expect(content).toContain('DB_TEST_PORT=5434');
      // Backend runtime values
      expect(content).toContain(`ADMIN_EMAIL=admin@${projectName}.example.com`);
      expect(content).toContain('PORT=4000');
      expect(content).toContain('@0.0.0.0:5432/');
    });

    it('should have frontend .env file', () => {
      const envPath = join(targetFolder, 'frontend', '.env');
      expect(existsSync(envPath)).toBe(true);
    });
  });

  describe('database migrations', () => {
    it.skipIf(!FULL)('should have generated drizzle migrations', () => {
      const drizzlePath = join(targetFolder, 'backend', 'drizzle');
      expect(existsSync(drizzlePath)).toBe(true);

      // Migrations live in timestamped subdirectories containing migration.sql
      const dirs = readdirSync(drizzlePath, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
      expect(dirs.length).toBeGreaterThan(0);

      const hasMigrationSql = dirs.some((dir) => existsSync(join(drizzlePath, dir, 'migration.sql')));
      expect(hasMigrationSql).toBe(true);
    });

    it.skipIf(!FULL)('should have snapshot files in migration directories', () => {
      const drizzlePath = join(targetFolder, 'backend', 'drizzle');
      const dirs = readdirSync(drizzlePath, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      const hasSnapshot = dirs.some((dir) => existsSync(join(drizzlePath, dir, 'snapshot.json')));
      expect(hasSnapshot).toBe(true);
    });
  });

  describe('git repository', () => {
    it('should have initialized git', () => {
      expect(existsSync(join(targetFolder, '.git'))).toBe(true);
    });

    it('should have upstream remote configured', () => {
      const configPath = join(targetFolder, '.git', 'config');
      const config = readFileSync(configPath, 'utf-8');
      expect(config).toContain('[remote "upstream"]');
      expect(config).toContain('cellajs/cella');
    });
  });

  describe('placeholder config', () => {
    it('should have interpolated default-config.ts without __tokens__', () => {
      const configPath = join(targetFolder, 'shared', 'config', 'config.default.ts');
      const content = readFileSync(configPath, 'utf-8');
      expect(content).not.toContain('__project_name__');
      expect(content).not.toContain('__project_slug__');
    });

    it.skipIf(!FULL)('should produce no TypeScript errors in shared/config/config.default.ts', () => {
      // Run tsc via the backend tsconfig which includes ../shared/*
      try {
        execSync('npx tsc --noEmit', { cwd: join(targetFolder, 'backend'), stdio: 'pipe' });
      } catch (error) {
        const e = error as { stdout?: Buffer; stderr?: Buffer };
        const output = `${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}`;
        throw new Error(`tsc reported errors in the scaffolded project:\n${output}`);
      }
    });
  });

  describe('generated env configs', () => {
    it('should have generated all env config files', () => {
      for (const mode of ['development', 'staging', 'tunnel', 'test', 'production']) {
        expect(existsSync(join(targetFolder, 'shared', 'config', `config.${mode}.ts`))).toBe(true);
      }
    });

    it('should contain correct mode and project name', () => {
      const content = readFileSync(join(targetFolder, 'shared', 'config', 'config.production.ts'), 'utf-8');
      expect(content).toContain("mode: 'production'");
      expect(content).toContain('satisfies DeepPartial<typeof _default>');
      expect(content).not.toContain('Cella');
    });

    it('should have project-specific values in development config', () => {
      const content = readFileSync(join(targetFolder, 'shared', 'config', 'config.development.ts'), 'utf-8');
      expect(content).toContain("mode: 'development'");
      expect(content).toContain("'http://localhost:3000'");
      expect(content).toContain("'http://localhost:4000'");
      expect(content).not.toContain("name: 'Cella DEVELOPMENT'");
    });

    it('should have test config deriving from development', () => {
      const content = readFileSync(join(targetFolder, 'shared', 'config', 'config.test.ts'), 'utf-8');
      expect(content).toContain("mode: 'test'");
      expect(content).toContain('development.frontendUrl');
      expect(content).toContain('development.backendUrl');
    });
  });
});
