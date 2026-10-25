// @vitest-environment jsdom
import { createRef, type RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TriggerRef } from '~/modules/common/overlay-store-helpers';
import { type DropdownData, dropdowner } from './use-dropdowner';

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

const isDone = (ref: TriggerRef) => ref.current?.hasAttribute('data-dropdowner-done');

describe('dropdowner store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    dropdowner.setState({ dropdown: null, lastRemovedTriggerId: null, lastRemovedAt: 0, done: null });
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('swallows the click that follows a dismissal on the same trigger, but never a programmatic open', () => {
    const data = dropdown('t1');
    dropdowner.getState().create(null, data);
    dropdowner.getState().remove();
    dropdowner.getState().create(null, { ...data, programmatic: true });
    expect(dropdowner.getState().dropdown?.triggerId).toBe('t1');

    dropdowner.getState().remove();
    dropdowner.getState().create(null, data);
    expect(dropdowner.getState().dropdown).toBeNull();
  });

  it('merges updates into the open dropdown and ignores them when closed', () => {
    dropdowner.getState().update({ align: 'end' });
    expect(dropdowner.getState().dropdown).toBeNull();

    dropdowner.getState().create(null, dropdown('t1'));
    dropdowner.getState().update({ align: 'end', content: 'next' });

    expect(dropdowner.getState().dropdown).toMatchObject({ align: 'end', content: 'next', triggerId: 't1' });
  });

  it('push steps into new content and back returns to it, then closes', () => {
    dropdowner.getState().create('menu', dropdown('t1'));
    const { key } = dropdowner.getState().dropdown ?? {};

    dropdowner.getState().push('confirm');
    expect(dropdowner.getState().dropdown).toMatchObject({ content: 'confirm', history: ['menu'], key });

    dropdowner.getState().back();
    expect(dropdowner.getState().dropdown).toMatchObject({ content: 'menu', history: [], key });

    dropdowner.getState().back();
    expect(dropdowner.getState().dropdown).toBeNull();
  });

  it('complete closes the dropdown and marks its trigger done until the mark times out', () => {
    const data = dropdown('t1');
    dropdowner.getState().create(null, data);

    dropdowner.getState().complete('Copied');

    expect(dropdowner.getState().dropdown).toBeNull();
    expect(isDone(data.triggerRef)).toBe(true);
    expect(dropdowner.getState().done).toMatchObject({ trigger: data.triggerRef.current, label: 'Copied', open: true });

    vi.runAllTimers();
    expect(isDone(data.triggerRef)).toBe(false);
    expect(dropdowner.getState().done?.open).toBe(false);
  });
});
