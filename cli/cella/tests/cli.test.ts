import process from 'node:process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CellaCliConfig } from '../src/config/types';

const { selectMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
}));

vi.mock('@inquirer/prompts', () => ({
  select: selectMock,
}));

vi.mock('../src/utils/display', () => ({
  NAME: 'cella',
  VERSION: 'test',
  printHeader: vi.fn(),
  setJsonMode: vi.fn(),
}));

const { parseCli } = await import('../src/cli');

const baseConfig: CellaCliConfig = {
  settings: {
    upstreamUrl: 'git@github.com:cellajs/cella.git',
    upstreamBranch: 'main',
    workingBranch: 'main',
  },
};

describe('parseCli', () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
    selectMock.mockReset();
    vi.restoreAllMocks();
  });

  it('prompts for a service when no arguments are provided', async () => {
    process.argv = ['node', 'cella'];
    selectMock.mockResolvedValue('analyze');

    const config = await parseCli(baseConfig, '/tmp/fork');

    expect(selectMock).toHaveBeenCalledOnce();
    expect(config.service).toBe('analyze');
  });

  it('parses a positional service', async () => {
    process.argv = ['node', 'cella', 'analyze'];

    const config = await parseCli(baseConfig, '/tmp/fork');

    expect(config.service).toBe('analyze');
  });

  it('parses a subcommand with additional options', async () => {
    process.argv = ['node', 'cella', 'contributions', '--fork', 'raak', '--list', '--json', '--diff', 'README.md'];

    const config = await parseCli(baseConfig, '/tmp/fork');

    expect(config.service).toBe('contributions');
    expect(config.fork).toBe('raak');
    expect(config.list).toBe(true);
    expect(config.json).toBe(true);
    expect(config.diff).toBe('README.md');
  });

  it('parses service-specific flags for sync', async () => {
    process.argv = ['node', 'cella', 'sync', '--log', '--hard'];

    const config = await parseCli(baseConfig, '/tmp/fork');

    expect(config.service).toBe('sync');
    expect(config.logFile).toBe(true);
    expect(config.hard).toBe(true);
  });
});
