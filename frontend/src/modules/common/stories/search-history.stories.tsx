import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { AppSearch } from '~/modules/navigation/app-search';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { withApp } from '~/stories/with-app';

const history = ['passkeys', 'sessions', 'tenants'];

/** Recent searches of the app search: a numbered history group and an index shortcut. Docs search: docs-search.test.tsx. */
const meta = {
  title: 'common/SearchHistory',
  decorators: [withApp],
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const historyOption = (canvas: ReturnType<typeof within>, value: string) =>
  canvas.getByRole('option', { name: new RegExp(`^${value}\\s*\\d`) });

export const AppSearchHistory: Story = {
  beforeEach: () => {
    useNavigationStore.setState({ recentSearches: [...history] });
    return () => useNavigationStore.setState({ recentSearches: [] });
  },
  render: () => (
    <div className="w-[36rem]">
      <AppSearch />
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole('combobox');

    await step('lists recent searches with their index', async () => {
      for (const [index, value] of history.entries()) {
        await expect(historyOption(canvas, value)).toHaveTextContent(`${value}${index}`);
      }
    });

    await step('the remove button drops one entry', async () => {
      await userEvent.click(within(historyOption(canvas, 'sessions')).getByRole('button'));

      await expect(useNavigationStore.getState().recentSearches).toEqual(['passkeys', 'tenants']);
      await waitFor(() => expect(canvas.queryByRole('option', { name: /^sessions/ })).toBeNull());
    });

    await step('a bare index typed into the empty input picks that entry', async () => {
      await userEvent.type(input, '1');
      await expect(input).toHaveValue('tenants');
    });
  },
};
