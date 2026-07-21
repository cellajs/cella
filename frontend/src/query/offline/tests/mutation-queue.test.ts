import { onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { canCoalesce, isActive, isPending, isQueued } from '../mutation-queue';

const paused = { state: { status: 'pending', isPaused: true } };
const inFlight = { state: { status: 'pending', isPaused: false } };
const settled = { state: { status: 'success', isPaused: false } };

describe('mutation-queue classification', () => {
  it('isQueued is true only for a paused pending mutation', () => {
    expect(isQueued(paused)).toBe(true);
    expect(isQueued(inFlight)).toBe(false);
    expect(isQueued(settled)).toBe(false);
  });

  it('isActive is true only for a non-paused pending mutation', () => {
    expect(isActive(inFlight)).toBe(true);
    expect(isActive(paused)).toBe(false);
    expect(isActive(settled)).toBe(false);
  });

  it('isPending is true for both active and queued, false once settled', () => {
    expect(isPending(inFlight)).toBe(true);
    expect(isPending(paused)).toBe(true);
    expect(isPending(settled)).toBe(false);
  });
});

describe('canCoalesce online gate', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('is true only while offline', () => {
    onlineManager.setOnline(false);
    expect(canCoalesce()).toBe(true);
    onlineManager.setOnline(true);
    expect(canCoalesce()).toBe(false);
  });
});
