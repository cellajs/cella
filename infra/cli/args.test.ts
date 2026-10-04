import { describe, expect, it } from 'vitest';
import { parseCliArgs } from './args';

describe('parseCliArgs', () => {
  it('opens the menu when no action is named', () => {
    expect(parseCliArgs([])).toEqual({ once: false, help: false });
    expect(parseCliArgs(['--mode', 'staging'])).toEqual({ once: false, help: false, mode: 'staging' });
  });

  it('reads the first word as the action', () => {
    expect(parseCliArgs(['status'])).toMatchObject({ action: 'status' });
    expect(parseCliArgs(['db-close', '--mode', 'production'])).toMatchObject({ action: 'db-close', mode: 'production' });
  });

  it('never reads the value of --mode as the action', () => {
    expect(parseCliArgs(['--mode', 'production', 'apply'])).toMatchObject({ action: 'apply', mode: 'production' });
    expect(parseCliArgs(['--mode', 'status'])).toEqual({ once: false, help: false, mode: 'status' });
  });

  it('reports a word that names no action', () => {
    expect(parseCliArgs(['deploy'])).toMatchObject({ unknownAction: 'deploy' });
    expect(parseCliArgs(['deploy']).action).toBeUndefined();
  });

  it('reads --once and the help forms', () => {
    expect(parseCliArgs(['--once'])).toMatchObject({ once: true });
    expect(parseCliArgs(['help'])).toMatchObject({ help: true });
    expect(parseCliArgs(['--help'])).toMatchObject({ help: true });
    expect(parseCliArgs(['-h', 'apply'])).toMatchObject({ help: true, action: 'apply' });
  });

  it('lets the flags the actions read pass through', () => {
    expect(parseCliArgs(['apply', '--debug-provider', '--defaults'])).toEqual({ once: false, help: false, action: 'apply' });
  });
});
