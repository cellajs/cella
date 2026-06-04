import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SearchSpinner } from '~/modules/common/search-spinner';
import { Button } from '~/modules/ui/button';

const meta = {
  title: 'common/SearchSpinner',
  component: SearchSpinner,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof SearchSpinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: { isSearching: false, value: '' },
};

export const IdleWithValue: Story = {
  args: { isSearching: false, value: 'hello' },
};

export const Searching: Story = {
  args: { isSearching: true, value: 'hello' },
};

export const Interactive: Story = {
  args: { isSearching: false, value: 'test' },
  render: function Render(args) {
    const [isSearching, setIsSearching] = useState(args.isSearching);
    return (
      <div className="flex items-center gap-4">
        <SearchSpinner isSearching={isSearching} value={args.value} />
        <Button variant="outline" size="sm" onClick={() => setIsSearching(!isSearching)}>
          Toggle
        </Button>
      </div>
    );
  },
};
