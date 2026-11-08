import type { AppError } from '#/core/error';

/** The error `run` throws; fails the test, naming `guardName`, when it resolves. */
export const thrownBy = async (run: () => Promise<unknown>, guardName: string) => {
  try {
    await run();
  } catch (error) {
    return error as AppError;
  }
  throw new Error(`expected ${guardName} to throw`);
};
