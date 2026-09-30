import type { Meta, StoryObj } from '@storybook/react-vite';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearch } from '@tanstack/react-router';
import { expect, userEvent, within } from 'storybook/test';
import { getRouter } from '~/routes/-router-instance';
import { withApp } from '~/stories/with-app';

const greetingKey = ['story', 'greeting'];

/** Reads the URL and a seeded query, and navigates: the three things the harness provides. */
function HarnessProbe() {
  const search = useSearch({ strict: false }) as { tab?: string };
  const router = useRouter();
  const { data } = useQuery({ queryKey: greetingKey, queryFn: () => 'fetched', staleTime: Number.POSITIVE_INFINITY });

  return (
    <div>
      <p>greeting: {String(data)}</p>
      <p>tab: {search.tab ?? 'none'}</p>
      <button type="button" onClick={() => router.history.push('/?tab=members')}>
        members
      </button>
    </div>
  );
}

/** Test harness: an in-memory router plus the app query client, for stories of app-level components. */
const meta = {
  title: 'stories/withApp',
  component: HarnessProbe,
  decorators: [withApp],
  parameters: { app: { url: '/?tab=settings', queryData: [[greetingKey, 'seeded']] } },
} satisfies Meta<typeof HarnessProbe>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SeedsQueriesAndRoutes: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('greeting: seeded')).toBeVisible();
    await expect(canvas.getByText('tab: settings')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'members' }));
    await expect(await canvas.findByText('tab: members')).toBeVisible();
    // Imperative callers see the same router as the story.
    await expect(getRouter().state.location.search).toEqual({ tab: 'members' });
  },
};
