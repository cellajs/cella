import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { appConfig, type Language } from 'shared';
import { SelectLanguage } from '~/modules/common/form-fields/select-language';

const meta = { title: 'common/SelectLanguage', component: SelectLanguage, tags: ['autodocs'], parameters: { layout: 'centered' } } satisfies Meta<
  typeof SelectLanguage
>;

export default meta;
type Story = StoryObj<typeof meta>;

// The app's own languages: with only one, every story shows it
const languages: Language[] = [...appConfig.languageCodes];
const [first] = appConfig.languageCodes;
const last = languages[languages.length - 1];

export const Default: Story = {
  args: {
    value: first,
    options: languages,
    onChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<Language>(first);

    return (
      <div className="w-80">
        <SelectLanguage value={value} options={languages} onChange={setValue} />
      </div>
    );
  },
};

export const LastSelected: Story = {
  args: {
    value: last,
    options: languages,
    onChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<Language>(last);

    return (
      <div className="w-80">
        <SelectLanguage value={value} options={languages} onChange={setValue} />
      </div>
    );
  },
};

export const SingleOption: Story = {
  args: {
    value: first,
    options: [first],
    onChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<Language>(first);

    return (
      <div className="w-80">
        <SelectLanguage value={value} options={[first]} onChange={(next) => setValue(next)} />
      </div>
    );
  },
};
