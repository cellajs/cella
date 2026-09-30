// @vitest-environment jsdom
import { createRef, type RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fallbackContentRef } from '~/utils/fallback-content-ref';
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

const isActive = (ref: RefObject<HTMLButtonElement | null>) => ref.current?.hasAttribute('data-dropdowner-active');

describe('dropdowner store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    useDropdowner.setState({ dropdown: null, lastRemovedTriggerId: null, lastRemovedAt: 0 });
    fallbackContentRef.current = null;
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('opens one dropdown with its defaults and marks the trigger active', () => {
    const data = dropdown('t1');

    const id = useDropdowner.getState().create('menu', data);

    expect(id).toBe('t1');
    expect(useDropdowner.getState().get()).toMatchObject({
      triggerId: 't1',
      content: 'menu',
      align: 'start',
      modal: true,
      kind: 'panel',
    });
    expect(isActive(data.triggerRef)).toBe(true);
  });

  it('lets data override the defaults', () => {
    useDropdowner.getState().create(null, dropdown('t1', { align: 'end', modal: false, kind: 'menu' }));

    expect(useDropdowner.getState().dropdown).toMatchObject({ align: 'end', modal: false, kind: 'menu' });
  });

  it('closes when the same trigger opens it again', () => {
    const data = dropdown('t1');
    useDropdowner.getState().create(null, data);

    useDropdowner.getState().create(null, { ...data, id: 'other-id' });

    expect(useDropdowner.getState().dropdown).toBeNull();
    expect(isActive(data.triggerRef)).toBe(false);
    expect(useDropdowner.getState()).toMatchObject({ lastRemovedTriggerId: 't1', lastRemovedAt: 10_000 });
  });

  it('moves the active mark to a different trigger', () => {
    const first = dropdown('t1');
    const second = dropdown('t2');
    useDropdowner.getState().create(null, first);

    useDropdowner.getState().create('second', second);

    expect(useDropdowner.getState().dropdown?.triggerId).toBe('t2');
    expect(isActive(first.triggerRef)).toBe(false);
    expect(isActive(second.triggerRef)).toBe(true);
  });

  it('ignores a reopen from the same trigger within 300 ms of a removal, once', () => {
    const data = dropdown('t1');
    useDropdowner.getState().create(null, data);
    useDropdowner.getState().remove();
    expect(isActive(data.triggerRef)).toBe(false);

    vi.advanceTimersByTime(299);
    useDropdowner.getState().create(null, data);
    expect(useDropdowner.getState().dropdown).toBeNull();
    expect(useDropdowner.getState().lastRemovedTriggerId).toBeNull();

    // The guard is spent: the next click opens
    useDropdowner.getState().create(null, data);
    expect(useDropdowner.getState().dropdown?.triggerId).toBe('t1');
  });

  it('reopens from the same trigger after 300 ms', () => {
    const data = dropdown('t1');
    useDropdowner.getState().create(null, data);
    useDropdowner.getState().remove();

    vi.advanceTimersByTime(300);
    useDropdowner.getState().create(null, data);

    expect(useDropdowner.getState().dropdown?.triggerId).toBe('t1');
  });

  it('opens a different trigger right after a removal', () => {
    useDropdowner.getState().create(null, dropdown('t1'));
    useDropdowner.getState().remove();

    useDropdowner.getState().create(null, dropdown('t2'));

    expect(useDropdowner.getState().dropdown?.triggerId).toBe('t2');
  });

  it('lets a programmatic open bypass the reopen guard', () => {
    const data = dropdown('t1');
    useDropdowner.getState().create(null, data);
    useDropdowner.getState().remove();

    useDropdowner.getState().create(null, { ...data, programmatic: true });

    expect(useDropdowner.getState().dropdown?.triggerId).toBe('t1');
    expect(isActive(data.triggerRef)).toBe(true);
  });

  it('merges updates into the open dropdown and ignores them when closed', () => {
    useDropdowner.getState().update({ align: 'end' });
    expect(useDropdowner.getState().dropdown).toBeNull();

    useDropdowner.getState().create(null, dropdown('t1'));
    useDropdowner.getState().update({ align: 'end', content: 'next' });

    expect(useDropdowner.getState().dropdown).toMatchObject({ align: 'end', content: 'next', triggerId: 't1' });
  });

  it('records the removed trigger and clears its active mark', () => {
    const data = dropdown('t1');
    useDropdowner.getState().create(null, data);

    useDropdowner.getState().remove();

    expect(useDropdowner.getState()).toMatchObject({
      dropdown: null,
      lastRemovedTriggerId: 't1',
      lastRemovedAt: 10_000,
    });
    expect(isActive(data.triggerRef)).toBe(false);
  });

  it('blurs any focused element without touching the focus fallback', () => {
    const input = document.body.appendChild(document.createElement('input'));
    input.focus();

    useDropdowner.getState().create(null, dropdown('t1'));

    expect(document.activeElement).not.toBe(input);
    expect(fallbackContentRef.current).toBeNull();
  });
});
