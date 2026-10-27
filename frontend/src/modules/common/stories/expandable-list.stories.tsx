import type { Meta, StoryObj } from '@storybook/react-vite';
import { ExpandableList } from '~/modules/common/expandable-list';

const sampleItems = Array.from({ length: 8 }, (_, i) => ({ id: `item-${i + 1}`, label: `Item ${i + 1}` }));

type SampleItem = (typeof sampleItems)[number];

const meta = {
  title: 'common/ExpandableList',
  component: ExpandableList<SampleItem>,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ExpandableList<SampleItem>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    items: sampleItems,
    renderItem: (item) => <div className="border-b p-2">{item.label}</div>,
    initialDisplayCount: 3,
  },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
};

export const AllVisible: Story = {
  args: {
    items: sampleItems.slice(0, 3),
    renderItem: (item) => <div className="border-b p-2">{item.label}</div>,
    initialDisplayCount: 3,
  },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
};

export const AlwaysShowAll: Story = {
  args: {
    items: sampleItems,
    renderItem: (item) => <div className="border-b p-2">{item.label}</div>,
    initialDisplayCount: 3,
    alwaysShowAll: true,
  },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
};
