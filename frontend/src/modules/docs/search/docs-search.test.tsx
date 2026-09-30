// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The docs content index is a build-time virtual module; the search engine is not under test here.
vi.mock('~/modules/page/content', () => ({ docsConfig: { sections: [] } }));
vi.mock('~/modules/docs/search/client', () => ({
  getDocsSearchClient: async () => ({ search: async () => [] }),
}));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const { DocsSearch } = await import('~/modules/docs/search/docs-search');
const { useDocsSearchStore } = await import('~/modules/docs/search/docs-search-store');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom lacks the Web Animations API the scroll area waits on
Element.prototype.getAnimations ??= () => [];

const history = ['passkeys', 'sessions', 'tenants'];

let root: Root;
let container: HTMLDivElement;

const input = () => container.querySelector('input') as HTMLInputElement;
const historyRows = () => [...container.querySelectorAll('[role="option"]')].map((row) => row.textContent);
const historyRow = (value: string) =>
  [...container.querySelectorAll<HTMLElement>('[role="option"]')].find((row) => row.textContent?.startsWith(value));

/** Sets the input value the way a keystroke or paste does, so React sees a change event. */
async function enter(value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setValue?.call(input(), value);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  useDocsSearchStore.setState({ recentSearches: [...history] });

  container = document.body.appendChild(document.createElement('div'));
  root = createRoot(container);
  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <DocsSearch />
      </QueryClientProvider>,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('docs search history', () => {
  it('lists recent searches with their index', () => {
    expect(historyRows()).toEqual(['passkeys0', 'sessions1', 'tenants2']);
  });

  it('picks the entry for a bare index typed into the empty input', async () => {
    await enter('1');

    expect(input().value).toBe('sessions');
  });

  it('keeps a value that starts with a digit', async () => {
    await enter('2fa');

    expect(input().value).toBe('2fa');
  });

  it('keeps a digit typed after other text', async () => {
    await enter('a');
    await enter('a1');

    expect(input().value).toBe('a1');
  });

  it('drops one entry through its remove button', async () => {
    await act(async () => historyRow('passkeys')?.querySelector('button')?.click());

    expect(useDocsSearchStore.getState().recentSearches).toEqual(['sessions', 'tenants']);
    expect(historyRows()).toEqual(['sessions0', 'tenants1']);
  });

  it('runs the query of a picked entry', async () => {
    await act(async () => historyRow('tenants')?.click());

    expect(input().value).toBe('tenants');
  });
});
