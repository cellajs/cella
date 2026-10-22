// @vitest-environment jsdom
import { createRef, type RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fallbackContentRef } from '~/utils/fallback-content-ref';
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

const isActive = (ref: RefObject<HTMLElement | null>) => ref.current?.hasAttribute('data-dropdowner-active');
const isDone = (ref: RefObject<HTMLElement | null>) => ref.current?.hasAttribute('data-dropdowner-done');

describe('dropdowner store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    dropdowner.setState({ dropdown: null, lastRemovedTriggerId: null, lastRemovedAt: 0, done: null });
    fallbackContentRef.current = null;
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('opens one dropdown with its defaults and marks the trigger active', () => {
    const data = dropdown('t1');

    const id = dropdowner.getState().create('menu', data);

    expect(id).toBe('t1');
    expect(dropdowner.getState().get()).toMatchObject({ triggerId: 't1', content: 'menu', align: 'start', kind: 'panel' });
    expect(isActive(data.triggerRef)).toBe(true);
  });

  it('lets data override the defaults', () => {
    dropdowner.getState().create(null, dropdown('t1', { align: 'end', kind: 'menu' }));

    expect(dropdowner.getState().dropdown).toMatchObject({ align: 'end', kind: 'menu' });
  });

  it('keeps the defaults for options passed as undefined', () => {
    dropdowner.getState().create(null, dropdown('t1', { align: undefined, kind: undefined }));

    expect(dropdowner.getState().dropdown).toMatchObject({ align: 'start', kind: 'panel' });
  });

  it('closes when the same trigger opens it again', () => {
    const data = dropdown('t1');
    dropdowner.getState().create(null, data);

    dropdowner.getState().create(null, { ...data, id: 'other-id' });

    expect(dropdowner.getState().dropdown).toBeNull();
    expect(isActive(data.triggerRef)).toBe(false);
    expect(dropdowner.getState()).toMatchObject({ lastRemovedTriggerId: 't1', lastRemovedAt: 10_000 });
  });

  it('moves the active mark to a different trigger', () => {
    const first = dropdown('t1');
    const second = dropdown('t2');
    dropdowner.getState().create(null, first);

    dropdowner.getState().create('second', second);

    expect(dropdowner.getState().dropdown?.triggerId).toBe('t2');
    expect(isActive(first.triggerRef)).toBe(false);
    expect(isActive(second.triggerRef)).toBe(true);
  });

  it('ignores a reopen from the same trigger within 300 ms of a removal, once', () => {
    const data = dropdown('t1');
    dropdowner.getState().create(null, data);
    dropdowner.getState().remove();
    expect(isActive(data.triggerRef)).toBe(false);

    vi.advanceTimersByTime(299);
    dropdowner.getState().create(null, data);
    expect(dropdowner.getState().dropdown).toBeNull();
    expect(dropdowner.getState().lastRemovedTriggerId).toBeNull();

    // The guard is spent: the next click opens
    dropdowner.getState().create(null, data);
    expect(dropdowner.getState().dropdown?.triggerId).toBe('t1');
  });

  it('reopens from the same trigger after 300 ms', () => {
    const data = dropdown('t1');
    dropdowner.getState().create(null, data);
    dropdowner.getState().remove();

    vi.advanceTimersByTime(300);
    dropdowner.getState().create(null, data);

    expect(dropdowner.getState().dropdown?.triggerId).toBe('t1');
  });

  it('opens a different trigger right after a removal', () => {
    dropdowner.getState().create(null, dropdown('t1'));
    dropdowner.getState().remove();

    dropdowner.getState().create(null, dropdown('t2'));

    expect(dropdowner.getState().dropdown?.triggerId).toBe('t2');
  });

  it('lets a programmatic open bypass the reopen guard', () => {
    const data = dropdown('t1');
    dropdowner.getState().create(null, data);
    dropdowner.getState().remove();

    dropdowner.getState().create(null, { ...data, programmatic: true });

    expect(dropdowner.getState().dropdown?.triggerId).toBe('t1');
    expect(isActive(data.triggerRef)).toBe(true);
  });

  it('merges updates into the open dropdown and ignores them when closed', () => {
    dropdowner.getState().update({ align: 'end' });
    expect(dropdowner.getState().dropdown).toBeNull();

    dropdowner.getState().create(null, dropdown('t1'));
    dropdowner.getState().update({ align: 'end', content: 'next' });

    expect(dropdowner.getState().dropdown).toMatchObject({ align: 'end', content: 'next', triggerId: 't1' });
  });

  it('records the removed trigger and clears its active mark', () => {
    const data = dropdown('t1');
    dropdowner.getState().create(null, data);

    dropdowner.getState().remove();

    expect(dropdowner.getState()).toMatchObject({ dropdown: null, lastRemovedTriggerId: 't1', lastRemovedAt: 10_000 });
    expect(isActive(data.triggerRef)).toBe(false);
  });

  it('marks the trigger done after a completion, until 1.4 s have passed', () => {
    const data = dropdown('t1');
    dropdowner.getState().create(null, data);

    dropdowner.getState().complete('Copied');

    expect(isActive(data.triggerRef)).toBe(false);
    expect(isDone(data.triggerRef)).toBe(true);
    expect(dropdowner.getState().done).toMatchObject({ trigger: data.triggerRef.current, label: 'Copied', open: true });

    vi.advanceTimersByTime(1399);
    expect(isDone(data.triggerRef)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isDone(data.triggerRef)).toBe(false);
    expect(dropdowner.getState().done).toMatchObject({ label: 'Copied', open: false });
  });

  it('leaves the trigger unmarked after a plain removal', () => {
    const data = dropdown('t1');
    dropdowner.getState().create(null, data);

    dropdowner.getState().remove();

    expect(isDone(data.triggerRef)).toBe(false);
    expect(dropdowner.getState().done).toBeNull();
  });

  it('ends a done mark as soon as a dropdown opens, and marks the next one on its own', () => {
    const first = dropdown('t1');
    const second = dropdown('t2');
    dropdowner.getState().create(null, first);
    dropdowner.getState().complete('Copied');

    dropdowner.getState().create(null, second);
    expect(isDone(first.triggerRef)).toBe(false);
    expect(dropdowner.getState().done?.open).toBe(false);

    dropdowner.getState().complete('Link copied');
    expect(isDone(first.triggerRef)).toBe(false);
    expect(isDone(second.triggerRef)).toBe(true);
    expect(dropdowner.getState().done).toMatchObject({ trigger: second.triggerRef.current, label: 'Link copied', open: true });
  });

  it('calls onClose once when the dropdown is removed, toggled closed or replaced', () => {
    const onClose = vi.fn();
    const data = dropdown('t1', { onClose });

    dropdowner.getState().create(null, data);
    expect(onClose).not.toHaveBeenCalled();
    dropdowner.getState().remove();
    dropdowner.getState().remove();
    expect(onClose).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(301);
    dropdowner.getState().create(null, data);
    dropdowner.getState().create(null, data);
    expect(onClose).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(301);
    dropdowner.getState().create(null, data);
    dropdowner.getState().create(null, dropdown('t2'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('blurs any focused element without touching the focus fallback', () => {
    const input = document.body.appendChild(document.createElement('input'));
    input.focus();

    dropdowner.getState().create(null, dropdown('t1'));

    expect(document.activeElement).not.toBe(input);
    expect(fallbackContentRef.current).toBeNull();
  });
});
