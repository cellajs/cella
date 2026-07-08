import type { Log } from '../pino';

export type MockLog<TMock> = Record<keyof Log, TMock>;

export const createMockLog = <TMock>(fn: () => TMock): MockLog<TMock> => ({
  trace: fn(),
  debug: fn(),
  info: fn(),
  warn: fn(),
  error: fn(),
  fatal: fn(),
});

export const createMockPinoModule = <TMock>(fn: () => TMock) => ({
  log: createMockLog(fn),
});
