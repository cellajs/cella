// @vitest-environment jsdom
import { createRef, type RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type DropdownData, useDropdowner } from './use-dropdowner';

const trigger = (): RefObject<HTMLButtonElement | null> => {
  const ref = createRef<HTMLButtonElement>() as { current: HTMLButtonElement | null };
  ref.current = document.body.appendChild(document.createElement('button'));
  return ref;
};

const dropdown = (triggerId: string, data: Partial<DropdownData> = {}): DropdownData => ({
  id: triggerId,
  triggerId,
  triggerRef: trigger(),
  ...data,
});

const isDone = (ref: RefObject<HTMLButtonElement | null>) => ref.current?.hasAttribute('data-dropdowner-done');

describe('dropdowner store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    useDropdowner.setState({ dropdown: null, lastRemovedTriggerId: null, lastRemovedAt: 0, done: null });
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('swallows the click that follows a dismissal on the same trigger, but never a programmatic open', () => {
    const data = dropdown('t1');
    useDropdowner.getState().create(null, data);
    useDropdowner.getState().remove();
    useDropdowner.getState().create(null, { ...data, programmatic: true });
    expect(useDropdowner.getState().dropdown?.triggerId).toBe('t1');

    useDropdowner.getState().remove();
    useDropdowner.getState().create(null, data);
    expect(useDropdowner.getState().dropdown).toBeNull();
  });

  it('merges updates into the open dropdown and ignores them when closed', () => {
    useDropdowner.getState().update({ align: 'end' });
    expect(useDropdowner.getState().dropdown).toBeNull();

    useDropdowner.getState().create(null, dropdown('t1'));
    useDropdowner.getState().update({ align: 'end', content: 'next' });

    expect(useDropdowner.getState().dropdown).toMatchObject({ align: 'end', content: 'next', triggerId: 't1' });
  });

  it('complete closes the dropdown and marks its trigger done until the mark times out', () => {
    const data = dropdown('t1');
    useDropdowner.getState().create(null, data);

    useDropdowner.getState().complete('Copied');

    expect(useDropdowner.getState().dropdown).toBeNull();
    expect(isDone(data.triggerRef)).toBe(true);
    expect(useDropdowner.getState().done).toMatchObject({ trigger: data.triggerRef.current, label: 'Copied', open: true });

    vi.runAllTimers();
    expect(isDone(data.triggerRef)).toBe(false);
    expect(useDropdowner.getState().done?.open).toBe(false);
  });
});
