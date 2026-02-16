import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { create } from '#/create';

/**
 * E2E test for create-cella CLI.
 * This test does a full install and verifies the project is set up correctly.
 * Note: This test is slow (~60s+) as it runs pnpm install and generate.
 */
describe('create-cella e2e', () => {
  const projectName = `cella-e2e-test-${Date.now()}`;
  const targetFolder = join(tmpdir(), projectName);

  beforeAll(async () => {
    // Create a full project with all steps
    await create({
      projectName,
      targetFolder,
      newBranchName: 'development',
      packageManager: 'pnpm',
      silent: true,
    });
  }, 120000); // 2 minute timeout for full install

  afterAll(() => {
    // Cleanup
    if (existsSync(targetFolder)) {
      rmSync(targetFolder, { recursive: true, force: true });
    }
  });

  describe('project structure', () => {
    it('should create essential directories', () => {
      expect(existsSync(join(targetFolder, 'backend'))).toBe(true);
      expect(existsSync(join(targetFolder, 'frontend'))).toBe(true);
      expect(existsSync(join(targetFolder, 'config'))).toBe(true);
      expect(existsSync(join(targetFolder, 'locales'))).toBe(true);
    });

    it('should have node_modules installed', () => {
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
      expect(content).toContain('pnpm quick');
      expect(content).toContain('pnpm docker');
    });
  });

  describe('.env files', () => {
    it('should have backend .env file', () => {
      const envPath = join(targetFolder, 'backend', '.env');
      expect(existsSync(envPath)).toBe(true);
    });

    it('should have frontend .env file', () => {
      const envPath = join(targetFolder, 'frontend', '.env');
      expect(existsSync(envPath)).toBe(true);
    });
  });

  describe('database migrations', () => {
    it('should have generated drizzle migrations', () => {
      const drizzlePath = join(targetFolder, 'backend', 'drizzle');
      expect(existsSync(drizzlePath)).toBe(true);

      // Check that migration files exist (at least one .sql file)
      const files = readdirSync(drizzlePath);
      const sqlFiles = files.filter((f) => f.endsWith('.sql'));
      expect(sqlFiles.length).toBeGreaterThan(0);
    });

    it('should have drizzle meta folder', () => {
      const metaPath = join(targetFolder, 'backend', 'drizzle', 'meta');
      expect(existsSync(metaPath)).toBe(true);
    });
  });

  describe('git repository', () => {
    it('should have initialized git', () => {
      expect(existsSync(join(targetFolder, '.git'))).toBe(true);
    });

    it('should be on development branch', () => {
      const gitHead = readFileSync(join(targetFolder, '.git', 'HEAD'), 'utf-8');
      expect(gitHead.trim()).toBe('ref: refs/heads/development');
    });

    it('should have upstream remote configured', () => {
      const configPath = join(targetFolder, '.git', 'config');
      const config = readFileSync(configPath, 'utf-8');
      expect(config).toContain('[remote "upstream"]');
      expect(config).toContain('cellajs/cella');
    });
  });
});
