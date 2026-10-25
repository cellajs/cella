// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebounce } from '~/hooks/use-debounce';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let shown: string | undefined;

function Probe({ value }: { value: string }) {
  shown = useDebounce(value, 300, { immediateValue: '' });
  return null;
}

let root: Root;
const render = (value: string) => act(() => root.render(<Probe value={value} />));

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    root = createRoot(document.createElement('div'));
  });
  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it('applies the immediate value at once and drops the pending one', () => {
    render('a');
    render('ab');
    render('');
    expect(shown).toBe('');

    act(() => vi.advanceTimersByTime(300));
    expect(shown).toBe('');
  });
});
