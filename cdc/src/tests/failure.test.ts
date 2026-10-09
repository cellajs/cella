import { beforeEach, describe, expect, it } from 'vitest';
import { RESOURCE_LIMITS } from '../constants';
import { ApiUnreachableError, isPassingError, TransactionTooLargeError } from '../services/failure';
import { replicationState } from '../services/replication-state';

const { delaysMs, stuckAfter } = RESOURCE_LIMITS.reread;

/** A database error as the driver throws it, and as Drizzle wraps it. */
const pgError = (code: string, message = 'refused') => Object.assign(new Error(message), { code });
const wrapped = (code: string) => new Error('Failed query', { cause: pgError(code) });

describe('isPassingError', () => {
  it.each([
    ['a deadlock', pgError('40P01')],
    ['a serialization failure', pgError('40001')],
    ['a lost connection', pgError('08006')],
    ['a server that is starting', pgError('57P03')],
    ['a server out of connections', pgError('53300')],
    ['a lock it did not get in time', pgError('55P03')],
    ['a cancelled statement', pgError('57014')],
    ['a code inside a wrapped error', wrapped('40P01')],
    ['a refused socket', Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })],
    ['a connection the driver lost without a code', new Error('Connection terminated unexpectedly')],
    ['the API being away', new ApiUnreachableError()],
  ])('reads again for as long as it takes after %s', (_label, error) => {
    expect(isPassingError(error)).toBe(true);
  });

  it.each([
    ['a violated constraint', pgError('23505')],
    ['a value the column cannot hold', pgError('22001')],
    ['a missing column', pgError('42703')],
    ['a wrapped refusal', wrapped('23502')],
    ['an error of the worker itself', new Error('No organization for attachment row 1')],
    // A message that merely mentions a timeout is no connection trouble: the code decides.
    ['a refusal whose message mentions a timeout', pgError('23514', 'check "timeout_positive" violated')],
    ['a worker error whose message mentions a timeout', new Error('row has no timeout column')],
    ['a transaction too large to hold', new TransactionTooLargeError(100_000, 7)],
  ])('counts %s against the change', (_label, error) => {
    expect(isPassingError(error)).toBe(false);
  });
});

describe('replicationState: the failure the worker reads again from', () => {
  beforeEach(() => {
    replicationState.reset();
  });

  it('counts failures in a row at one position that the change caused, and is stuck after the set number', () => {
    for (let attempt = 1; attempt < stuckAfter; attempt++) {
      replicationState.recordFailure('0/50', pgError('23505'));
      expect(replicationState.stuck).toBe(false);
    }
    replicationState.recordFailure('0/50', pgError('23505'));

    expect(replicationState.failure).toMatchObject({ position: '0/50', count: stuckAfter, passing: false });
    expect(replicationState.stuck).toBe(true);
  });

  it('must not count connection trouble against the change, however long it lasts', () => {
    for (let attempt = 0; attempt < stuckAfter * 4; attempt++) replicationState.recordFailure('0/50', pgError('08006'));

    expect(replicationState.failure).toMatchObject({ count: 0, passing: true });
    expect(replicationState.stuck).toBe(false);
  });

  it('keeps the count across a passing failure in between, and starts over at another position', () => {
    replicationState.recordFailure('0/50', pgError('23505'));
    replicationState.recordFailure('0/50', pgError('08006'));
    replicationState.recordFailure('0/50', pgError('23505'));
    expect(replicationState.failure?.count).toBe(2);

    replicationState.recordFailure('0/90', pgError('23505'));
    expect(replicationState.failure).toMatchObject({ position: '0/90', count: 1 });
  });

  it('forgets the failure once a flush got past it', () => {
    replicationState.recordFailure('0/50', pgError('23505'));
    replicationState.clearFailure();

    expect(replicationState.failure).toBeNull();
    expect(replicationState.rereadDelayMs).toBe(delaysMs[0]);
  });

  it('waits longer before each read after a failure, up to the last delay', () => {
    const waits: number[] = [];
    for (let attempt = 0; attempt < delaysMs.length + 2; attempt++) {
      replicationState.recordFailure('0/50', pgError('08006'));
      waits.push(replicationState.rereadDelayMs);
    }

    expect(waits).toEqual([...delaysMs, delaysMs.at(-1), delaysMs.at(-1)]);
  });
});
