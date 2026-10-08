import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { baseDb } from '#/db/db';
import { log } from '#/utils/logger';
import { updateLastSeenAt } from './update-last-seen';

const THROTTLE_MS = 5 * 60 * 1000;

/** The stamp's UPDATE, standing in for the database: each call is one write. */
const write = vi.fn(async () => {});

let actor = 0;
/** An actor no other test stamped: the throttle is per actor and outlives a test. */
const newActorId = () => `actor-${actor++}`;

describe('updateLastSeenAt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    write.mockReset().mockResolvedValue(undefined);
    vi.spyOn(baseDb, 'update').mockReturnValue({ set: () => ({ where: write }) } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('writes once for calls within the throttle window', () => {
    const actorId = newActorId();

    updateLastSeenAt(actorId);
    vi.advanceTimersByTime(THROTTLE_MS - 1000);
    updateLastSeenAt(actorId);

    expect(write).toHaveBeenCalledTimes(1);
  });

  it('writes again after the window', () => {
    const actorId = newActorId();

    updateLastSeenAt(actorId);
    vi.advanceTimersByTime(THROTTLE_MS + 1000);
    updateLastSeenAt(actorId);

    expect(write).toHaveBeenCalledTimes(2);
  });

  it('throttles each actor on its own', () => {
    updateLastSeenAt(newActorId());
    updateLastSeenAt(newActorId());

    expect(write).toHaveBeenCalledTimes(2);
  });

  it('logs a failed write and must not retry it within the window', async () => {
    const actorId = newActorId();
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const err = new Error('database away');
    write.mockRejectedValue(err);

    updateLastSeenAt(actorId);
    await vi.advanceTimersByTimeAsync(0);
    expect(warn).toHaveBeenCalledWith('Last seen stamp failed', { actorId, err });

    // Every further request in the window leaves the database alone.
    for (let request = 0; request < 20; request++) updateLastSeenAt(actorId);
    expect(write).toHaveBeenCalledTimes(1);

    // The next window writes again.
    vi.advanceTimersByTime(THROTTLE_MS + 1000);
    updateLastSeenAt(actorId);
    expect(write).toHaveBeenCalledTimes(2);
  });
});
