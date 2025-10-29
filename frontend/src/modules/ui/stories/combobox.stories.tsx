import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import Combobox from '~/modules/ui/combobox';

/**
 * A searchable dropdown component with virtualization support for large option lists.
 */
const meta = {
  title: 'ui/Combobox',
  component: Combobox,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    options: { control: 'object' },
    value: { control: 'text' },
    disabled: { control: 'boolean' },
    renderAvatar: { control: 'boolean' },
    contentWidthMatchInput: { control: 'boolean' },
  },
  args: {
    disabled: false,
    renderAvatar: false,
    contentWidthMatchInput: true,
  },
} satisfies Meta<typeof Combobox>;

export default meta;

type Story = StoryObj<typeof meta>;

// Mock data for stories
const mockOptions = [
  { value: '1', label: 'John Doe', url: 'https://picsum.photos/100/100?random=1' },
  { value: '2', label: 'Jane Smith', url: 'https://picsum.photos/100/100?random=2' },
  { value: '3', label: 'Bob Johnson', url: 'https://picsum.photos/100/100?random=3' },
  { value: '4', label: 'Alice Brown', url: 'https://picsum.photos/100/100?random=4' },
  { value: '5', label: 'Charlie Wilson', url: 'https://picsum.photos/100/100?random=5' },
];

const largeOptions = Array.from({ length: 1000 }, (_, i) => ({
  value: i.toString(),
  label: `Option ${i + 1}`,
  url: `https://picsum.photos/100/100?random=${i}`,
}));

/**
 * Default combobox with basic options.
 */
export const Default: Story = {
  args: {
    options: mockOptions,
    value: '',
    onChange: () => {},
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <div className="w-80">
        <Combobox {...args} options={args.options} value={value} onChange={setValue} />
      </div>
    );
  },
};

/**
 * Combobox with avatar display for each option.
 */
export const WithAvatars: Story = {
  args: {
    options: mockOptions,
    value: '',
    onChange: () => {},
    renderAvatar: true,
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <div className="w-80">
        <Combobox {...args} options={args.options} value={value} onChange={setValue} renderAvatar={args.renderAvatar} />
      </div>
    );
  },
};

/**
 * Combobox with custom option rendering.
 */
export const CustomRenderOption: Story = {
  args: {
    options: mockOptions,
    value: '',
    onChange: () => {},
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <div className="w-80">
        <Combobox
          {...args}
          options={args.options}
          value={value}
          onChange={setValue}
          renderOption={(option) => (
            <div className="flex items-center justify-between w-full">
              <span className="font-medium">{option.label}</span>
              <span className="text-xs text-muted-foreground">ID: {option.value}</span>
            </div>
          )}
        />
      </div>
    );
  },
};

/**
 * Disabled combobox state.
 */
export const Disabled: Story = {
  args: {
    options: mockOptions,
    value: '1',
    onChange: () => {},
    disabled: true,
  },
  render: (args) => {
    const [value] = useState(args.value);
    return (
      <div className="w-80">
        <Combobox {...args} options={args.options} value={value} onChange={() => {}} disabled={args.disabled} />
      </div>
    );
  },
};

/**
 * Combobox with full width content (doesn't match input width).
 */
export const FullWidthContent: Story = {
  args: {
    options: mockOptions,
    value: '',
    onChange: () => {},
    contentWidthMatchInput: false,
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <div className="w-80">
        <Combobox {...args} options={args.options} value={value} onChange={setValue} contentWidthMatchInput={args.contentWidthMatchInput} />
      </div>
    );
  },
};

/**
 * Combobox with large number of options to demonstrate virtualization.
 */
export const LargeOptions: Story = {
  args: {
    options: largeOptions,
    value: '',
    onChange: () => {},
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <div className="w-80">
        <Combobox
          {...args}
          options={args.options}
          value={value}
          onChange={setValue}
          placeholders={{
            trigger: 'Select from 1000 options...',
            search: 'Search options...',
            notFound: 'No options found',
          }}
        />
      </div>
    );
  },
};

/**
 * Combobox with custom placeholders.
 */
export const CustomPlaceholders: Story = {
  args: {
    options: mockOptions,
    value: '',
    onChange: () => {},
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <div className="w-80">
        <Combobox
          {...args}
          options={args.options}
          value={value}
          onChange={setValue}
          placeholders={{
            trigger: 'Choose a person...',
            search: 'Search people...',
            notFound: 'No people found',
          }}
        />
      </div>
    );
  },
};

/**
 * Combobox with pre-selected value.
 */
export const WithPreselectedValue: Story = {
  args: {
    options: mockOptions,
    value: '2',
    onChange: () => {},
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <div className="w-80">
        <Combobox {...args} options={args.options} value={value} onChange={setValue} />
      </div>
    );
  },
};

/**
 * Multiple comboboxes side by side.
 */
export const Multiple: Story = {
  args: {
    options: mockOptions,
    value: '',
    onChange: () => {},
  },
  render: (args) => {
    const [value1, setValue1] = useState('');
    const [value2, setValue2] = useState('');
    const [value3, setValue3] = useState('');

    return (
      <div className="space-y-4 w-80">
        <Combobox {...args} options={args.options} value={value1} onChange={setValue1} placeholders={{ trigger: 'First selection...' }} />
        <Combobox
          {...args}
          options={args.options}
          value={value2}
          onChange={setValue2}
          renderAvatar={true}
          placeholders={{ trigger: 'Second selection...' }}
        />
        <Combobox
          {...args}
          options={args.options}
          value={value3}
          onChange={setValue3}
          contentWidthMatchInput={false}
          placeholders={{ trigger: 'Third selection...' }}
        />
      </div>
    );
  },
};
