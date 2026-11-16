import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { appConfig, type Language } from 'shared';
import { expect, userEvent, within } from 'storybook/test';
import { Dropdowner } from '~/modules/common/dropdowner/provider';
import { SelectLanguages } from '~/modules/common/form-fields/select-languages';

const meta = { title: 'common/SelectLanguages', component: SelectLanguages, tags: ['autodocs'], parameters: { layout: 'centered' } } satisfies Meta<
  typeof SelectLanguages
>;

export default meta;
type Story = StoryObj<typeof meta>;

function SelectLanguagesStory({ initialValue }: { initialValue: Language[] }) {
  const [value, setValue] = useState<Language[]>(initialValue);

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
    value: [...appConfig.languageCodes],
    onChange: () => {},
  },
  render: function Render() {
    return <SelectLanguagesStory initialValue={[...appConfig.languageCodes]} />;
  },
};

export const ShouldOpenAndToggleLanguage: Story = {
  name: 'when opening the language picker, should toggle a language',
  tags: ['!dev', '!autodocs'],
  args: {
    value: [],
    onChange: () => {},
  },
  render: function Render() {
    return <SelectLanguagesStory initialValue={[]} />;
  },
  play: async ({ canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body);
    const trigger = await body.findByRole('button', { name: /select.languages/i });
    // With one language there is nothing to choose
    if (appConfig.languageCodes.length < 2) return expect(trigger).toBeDisabled();

    await step('open the language picker', async () => {
      await userEvent.click(trigger);
      expect(await body.findByRole('listbox')).toBeInTheDocument();
    });

    // Starts empty, so the toggle selects the last language
    await step('toggle the last language', async () => {
      const options = await body.findAllByRole('option');
      const last = options[options.length - 1];
      await userEvent.click(last);
      expect(last).toHaveAttribute('aria-selected', 'true');
    });
  },
};
