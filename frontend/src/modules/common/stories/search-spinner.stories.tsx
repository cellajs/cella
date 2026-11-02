import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SearchSpinner } from '~/modules/common/search-spinner';
import { Button } from '~/modules/ui/button';

const meta = { title: 'common/SearchSpinner', component: SearchSpinner, tags: ['autodocs'], parameters: { layout: 'centered' } } satisfies Meta<
  typeof SearchSpinner
>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = { args: { isSearching: false, hasSearch: false } };

export const IdleWithValue: Story = { args: { isSearching: false, hasSearch: true } };

export const Searching: Story = { args: { isSearching: true, hasSearch: true } };

export const Interactive: Story = {
  args: { isSearching: false, hasSearch: true },
  render: function Render(args) {
    const [isSearching, setIsSearching] = useState(args.isSearching);
    return (
      <div className="flex items-center gap-4">
        <SearchSpinner isSearching={isSearching} hasSearch={args.hasSearch} />
        <Button variant="outline" size="sm" onClick={() => setIsSearching(!isSearching)}>
          Toggle
        </Button>
      </div>
    );
  },
};
