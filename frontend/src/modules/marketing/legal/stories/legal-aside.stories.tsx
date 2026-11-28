import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { getSection } from '~/hooks/scroll-spy-store';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { LegalAside } from '~/modules/marketing/legal/legal-aside';
import type { LegalSubject } from '~/modules/marketing/legal/legal-config';
import { getRouter } from '~/routes/-router-instance';
import { bars, SpyPage } from '~/stories/spy-page';
import { withApp } from '~/stories/with-app';

/** The legal page's subject nav, a scroll-spy aside. */
const meta = { title: 'marketing/LegalAside', decorators: [withApp], parameters: { layout: 'fullscreen' } } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

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

const legalIds = ['overview', 'introduction', 'cookies'];

function LegalSpyPage() {
  useScrollSpy(legalIds);
  return <SpyPage ids={legalIds} aside={<LegalAside subjects={subjects} currentSubject={'terms' as LegalSubject} />} />;
}

/** Away from its overview a subject click scrolls back there and keeps the subject open; at the overview it collapses. The chevron toggles without navigating. */
export const LegalSubjectReclick: Story = {
  render: () => <LegalSpyPage />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const termsLink = (await canvas.findByText(/terms_of_use/)).closest('a') as HTMLElement;
    const [termsCookies] = canvasElement.querySelectorAll<HTMLElement>('[data-spy-link="cookies"]');

    await userEvent.click(within(termsCookies).getByRole('link', { name: 'Cookies' }));
    await waitFor(() => expect(getSection()).toBe('cookies'));

    await userEvent.click(termsLink);
    await expect(termsLink).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(getSection()).toBe('overview'));
    await waitFor(() => expect(termsCookies).toHaveAttribute('data-active', 'false'));

    await userEvent.click(termsLink);
    await waitFor(() => expect(termsLink).toHaveAttribute('aria-expanded', 'false'));

    const { pathname } = getRouter().state.location;
    await userEvent.click(within(termsLink.parentElement as HTMLElement).getByRole('button', { hidden: true }));
    await waitFor(() => expect(termsLink).toHaveAttribute('aria-expanded', 'true'));
    await expect(getRouter().state.location.pathname).toBe(pathname);
  },
};
