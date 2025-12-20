import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '~/modules/ui/command';

/**
 * Fast, composable, unstyled command menu for React.
 */
const meta = {
  title: 'ui/Command',
  component: Command,
  tags: ['autodocs'],
  argTypes: {},
  args: {
    className: 'rounded-lg w-96 border shadow-md',
  },
  render: (args) => (
    <Command {...args}>
      <CommandInput placeholder="Type a command or search..." value={''} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem>Calendar</CommandItem>
          <CommandItem>Search Emoji</CommandItem>
          <CommandItem disabled>Calculator</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem>Profile</CommandItem>
          <CommandItem>Billing</CommandItem>
          <CommandItem>Settings</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof Command>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default form of the command.
 */
export const Default: Story = {};

export const TypingInCombobox: Story = {
  name: 'when typing into the combobox, should filter results',
  tags: ['!dev', '!autodocs'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('combobox');

    // Search for "calendar" which should return a single result
    await userEvent.type(input, 'calen', { delay: 100 });
    expect(canvas.getAllByRole('option', { name: /calendar/i })).toHaveLength(1);

    await userEvent.clear(input);

    // Search for "story" which should return multiple results
    await userEvent.type(input, 'se', { delay: 100 });
    expect(canvas.getAllByRole('option').length).toBeGreaterThan(1);
    expect(canvas.getAllByRole('option', { name: /search/i })).toHaveLength(1);

    await userEvent.clear(input);

    // Search for "story" which should return no results
    await userEvent.type(input, 'story', { delay: 100 });
    expect(canvas.queryAllByRole('option', { hidden: false })).toHaveLength(0);
    expect(canvas.getByText(/no results/i)).toBeVisible();
  },
};
