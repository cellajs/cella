import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { getSection } from '~/hooks/use-scroll-spy-store';
import type { LegalSubject } from '~/modules/auth/legal/legal-config';
import { LegalAside } from '~/modules/marketing/legal/legal-aside';
import { TocAside } from '~/modules/page/toc-aside';
import { withApp } from '~/stories/with-app';

/** Scroll-spy asides: the docs page "on this page" nav and the legal page subject nav. */
const meta = { title: 'common/SpyAsides', decorators: [withApp], parameters: { layout: 'fullscreen' } } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Aside on the left, one screen-high section per id on the right, each with its `spy-` anchor. */
function SpyPage({ ids, aside }: { ids: string[]; aside: ReactNode }) {
  return (
    <div className="flex">
      <div className="sticky top-0 h-screen w-64 shrink-0">{aside}</div>
      <div className="flex-1">
        {ids.map((id) => (
          <section key={id} className="h-screen">
            <div id={`spy-${id}`} />
            {id}
          </section>
        ))}
        <div className="h-screen" />
      </div>
    </div>
  );
}

const rowOf = (el: HTMLElement) => el.closest<HTMLElement>('[data-spy-link]') as HTMLElement;
const bars = (root: HTMLElement) => root.querySelectorAll('span.bg-primary.rounded-full');

// ─── TOC ─────────────────────────────────────────────────────────────────────

const headings = [
  { id: 'intro', text: 'Intro', depth: 2 },
  { id: 'setup', text: 'Setup', depth: 2 },
  { id: 'setup-details', text: 'Details', depth: 3 },
];
const headingIds = headings.map((h) => h.id);

function TocPage() {
  useScrollSpy(headingIds);
  return <SpyPage ids={headingIds} aside={<TocAside headings={headings} />} />;
}

/** One row per heading, deeper headings indented; the active row carries the bar, and a click scrolls there. */
export const Toc: Story = {
  render: () => <TocPage />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nav = await canvas.findByRole('navigation', { name: /on_this_page/ });

    const intro = within(nav).getByRole('link', { name: 'Intro' });
    const details = within(nav).getByRole('link', { name: 'Details' });
    await expect(intro).toHaveAttribute('href', '/#intro');
    await expect(intro).toHaveClass('pl-5');
    await expect(details).toHaveClass('pl-8');

    // The first registered section is current until something scrolls
    await waitFor(() => expect(rowOf(intro)).toHaveAttribute('data-active', 'true'));
    await expect(bars(nav)).toHaveLength(1);
    await expect(rowOf(intro).contains(bars(nav)[0])).toBe(true);

    await userEvent.click(details);

    await waitFor(() => expect(getSection()).toBe('setup-details'));
    await waitFor(() => expect(rowOf(details)).toHaveAttribute('data-active', 'true'));
    await expect(rowOf(details)).toHaveAttribute('data-spy-active');
    await expect(rowOf(intro)).toHaveAttribute('data-active', 'false');
    await waitFor(() => expect(bars(nav)).toHaveLength(1));
    await expect(rowOf(details).contains(bars(nav)[0])).toBe(true);
  },
};

// ─── Legal ───────────────────────────────────────────────────────────────────

const subjects = [
  {
    id: 'terms' as LegalSubject,
    label: 'c:terms_of_use' as const,
    sections: [
      { id: 'overview', label: 'Overview' },
      { id: 'introduction', label: 'Introduction' },
      { id: 'cookies', label: 'Cookies' },
    ],
  },
  {
    id: 'privacy' as LegalSubject,
    label: 'c:privacy_policy' as const,
    sections: [
      { id: 'overview', label: null },
      { id: 'introduction', label: 'Introduction' },
      { id: 'cookies', label: 'Cookies' },
    ],
  },
];

/**
 * The current subject is expanded; its rows are active by section, falling back to 'overview' while the spy
 * has none, and rows of another subject never are.
 */
export const Legal: Story = {
  render: () => (
    <SpyPage ids={['overview', 'introduction', 'cookies']} aside={<LegalAside subjects={subjects} currentSubject={'terms' as LegalSubject} />} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // The subject link is the collapsible trigger, so it carries a button role
    const termsLink = (await canvas.findByText(/terms_of_use/)).closest('a');
    await expect(termsLink).toHaveAttribute('href', '/legal/terms#overview');

    const rows = (id: string) => [...canvasElement.querySelectorAll<HTMLElement>(`[data-spy-link="${id}"]`)];
    // The privacy overview has no label and no row
    await expect(rows('overview')).toHaveLength(1);
    const [termsOverview] = rows('overview');
    const [termsCookies, privacyCookies] = rows('cookies');

    await expect(getSection()).toBe('');
    await expect(termsOverview).toHaveAttribute('data-active', 'true');
    await expect(privacyCookies).not.toBeVisible();
    await expect(bars(canvasElement)).toHaveLength(1);

    await userEvent.click(within(termsCookies).getByRole('link', { name: 'Cookies' }));

    await waitFor(() => expect(termsCookies).toHaveAttribute('data-active', 'true'));
    await expect(termsOverview).toHaveAttribute('data-active', 'false');
    await expect(privacyCookies).toHaveAttribute('data-active', 'false');
    await expect(privacyCookies).toHaveAttribute('data-spy-active');
    await waitFor(() => expect(bars(canvasElement)).toHaveLength(1));
    await expect(termsCookies.contains(bars(canvasElement)[0])).toBe(true);
  },
};
