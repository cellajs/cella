import type { Meta, StoryObj } from '@storybook/react-vite';

import BlockNote from '~/modules/common/blocknote/index';

const meta = {
  title: 'Common/BlockNote',
  component: BlockNote,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'light',
    },
    docs: {
      description: {
        component: 'A rich text editor component with formatting capabilities.',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    id: 'storybook-blocknote',
    type: 'create',
    updateData: () => {},
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-4xl mx-auto p-8 bg-white rounded-lg shadow-lg border border-gray-200">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">BlockNote Editor</h2>
          <p className="text-gray-600">Rich text editor with markdown support and formatting options</p>
        </div>
        <div className="border pl-10 p-4 border-gray-300 rounded-md overflow-hidden">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof BlockNote>;

export default meta;
type Story = StoryObj<typeof BlockNote>;

export const Basic: Story = {
  args: {
    defaultValue: '',
  },
};

export const WithContent: Story = {
  args: {
    defaultValue: JSON.stringify([
      {
        id: 'block1',
        type: 'paragraph',
        props: {},
        content: [
          { type: 'text', text: 'Hello, ' },
          { type: 'text', text: 'BlockNote!', styles: { bold: true } },
        ],
        children: [],
      },
      {
        id: 'block2',
        type: 'heading',
        props: { level: 2 },
        content: [{ type: 'text', text: 'Sample Heading' }],
        children: [],
      },
      {
        id: 'block3',
        type: 'paragraph',
        props: {},
        content: [{ type: 'text', text: 'This is a basic BlockNote editor story.' }],
        children: [],
      },
    ]),
  },
};

export const ReadOnly: Story = {
  args: {
    type: 'preview',
    defaultValue: JSON.stringify([
      {
        id: 'block1',
        type: 'paragraph',
        props: {},
        content: [{ type: 'text', text: 'This is a read-only BlockNote editor.' }],
        children: [],
      },
    ]),
  },
};
