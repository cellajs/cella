import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SelectLanguage } from '~/modules/common/form-fields/select-language';

const meta = {
  title: 'common/SelectLanguage',
  component: SelectLanguage,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof SelectLanguage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: 'en',
    options: ['en', 'nl'],
    onChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<'en' | 'nl'>('en');

    return (
      <div className="w-80">
        <SelectLanguage value={value} options={['en', 'nl']} onChange={setValue} />
      </div>
    );
  },
};

export const DutchSelected: Story = {
  args: {
    value: 'nl',
    options: ['en', 'nl'],
    onChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<'en' | 'nl'>('nl');

    return (
      <div className="w-80">
        <SelectLanguage value={value} options={['en', 'nl']} onChange={setValue} />
      </div>
    );
  },
};

export const SingleOption: Story = {
  args: {
    value: 'en',
    options: ['en'],
    onChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<'en' | 'nl'>('en');

    return (
      <div className="w-80">
        <SelectLanguage value={value} options={['en']} onChange={(next) => setValue(next)} />
      </div>
    );
  },
};
