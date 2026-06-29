import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { Dropdowner } from '~/modules/common/dropdowner/provider';
import { SelectLanguages } from '~/modules/common/form-fields/select-languages';

const meta = {
  title: 'common/SelectLanguages',
  component: SelectLanguages,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof SelectLanguages>;

export default meta;
type Story = StoryObj<typeof meta>;

function SelectLanguagesStory({ initialValue }: { initialValue: Array<'en' | 'nl'> }) {
  const [value, setValue] = useState<Array<'en' | 'nl'>>(initialValue);

  return (
    <>
      <div className="w-80">
        <SelectLanguages value={value} onChange={setValue} />
      </div>
      <Dropdowner />
    </>
  );
}

export const Empty: Story = {
  args: {
    value: [],
    onChange: () => {},
  },
  render: function Render() {
    return <SelectLanguagesStory initialValue={[]} />;
  },
};

export const SingleSelected: Story = {
  args: {
    value: ['en'],
    onChange: () => {},
  },
  render: function Render() {
    return <SelectLanguagesStory initialValue={['en']} />;
  },
};

export const MultipleSelected: Story = {
  args: {
    value: ['en', 'nl'],
    onChange: () => {},
  },
  render: function Render() {
    return <SelectLanguagesStory initialValue={['en', 'nl']} />;
  },
};

export const ShouldOpenAndToggleLanguage: Story = {
  name: 'when opening the language picker, should toggle a language',
  tags: ['!dev', '!autodocs'],
  args: {
    value: ['en'],
    onChange: () => {},
  },
  render: function Render() {
    return <SelectLanguagesStory initialValue={['en']} />;
  },
  play: async ({ canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body);

    await step('open the language picker', async () => {
      await userEvent.click(await body.findByRole('button', { name: /select language/i }));
      expect(await body.findByRole('listbox')).toBeInTheDocument();
    });

    await step('toggle the second language', async () => {
      const options = await body.findAllByRole('option');
      await userEvent.click(options[1]);
      expect(options[1]).toHaveAttribute('aria-selected', 'true');
    });
  },
};
