import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { getSection } from '~/hooks/scroll-spy-store';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { TocAside } from '~/modules/page/toc-aside';
import { bars, rowOf, SpyPage } from '~/stories/spy-page';
import { withApp } from '~/stories/with-app';

/** The docs page's "on this page" nav, a scroll-spy aside. */
const meta = { title: 'page/TocAside', decorators: [withApp], parameters: { layout: 'fullscreen' } } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

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
