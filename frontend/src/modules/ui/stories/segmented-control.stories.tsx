import type { Meta, StoryObj } from '@storybook/react-vite';
import { LayoutGridIcon, ListIcon, TableIcon } from 'lucide-react';
import { useState } from 'react';
import { SegmentedControl, SegmentedControlItem } from '~/modules/ui/segmented-control';

interface StoryArgs {
  size: 'default' | 'sm' | 'xs';
}

/**
 * One exclusive choice among a few short options, with a pill on the selected one.
 */
const meta: Meta<StoryArgs> = {
  title: 'ui/SegmentedControl',
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: { size: 'default' },
  argTypes: { size: { options: ['default', 'sm', 'xs'], control: { type: 'radio' } } },
  render: function Render({ size }) {
    const [value, setValue] = useState('write');
    return (
      <SegmentedControl size={size} aria-label="Mode" value={value} onValueChange={(next: string) => setValue(next)}>
        <SegmentedControlItem value="write">Write</SegmentedControlItem>
        <SegmentedControlItem value="preview">Preview</SegmentedControlItem>
      </SegmentedControl>
    );
  },
};

export default meta;

type Story = StoryObj<StoryArgs>;

export const Default: Story = {};

export const Small: Story = { args: { size: 'sm' } };

export const ExtraSmall: Story = { args: { size: 'xs' } };

/**
 * An icon-only item needs an `aria-label`.
 */
export const Icons: Story = {
  render: function Render({ size }) {
    const [value, setValue] = useState('list');
    return (
      <SegmentedControl size={size} aria-label="View" value={value} onValueChange={(next: string) => setValue(next)}>
        <SegmentedControlItem value="list" aria-label="List">
          <ListIcon />
        </SegmentedControlItem>
        <SegmentedControlItem value="table" aria-label="Table">
          <TableIcon />
        </SegmentedControlItem>
        <SegmentedControlItem value="grid" aria-label="Grid">
          <LayoutGridIcon />
        </SegmentedControlItem>
      </SegmentedControl>
    );
  },
};
