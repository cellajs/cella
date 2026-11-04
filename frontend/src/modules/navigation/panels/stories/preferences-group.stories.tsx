import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, within } from 'storybook/test';
import { PreferenceSwitch, PreferencesGroup } from '~/modules/navigation/panels/preferences-group';

function Groups() {
  const [dark, setDark] = useState(false);
  const [contrast, setContrast] = useState(true);
  const [keepOpen, setKeepOpen] = useState(false);
  return (
    <div className="flex w-72 flex-col gap-4">
      <PreferencesGroup title="Appearance">
        <PreferenceSwitch id="dark" label="Dark mode" checked={dark} onCheckedChange={setDark} />
        <PreferenceSwitch id="contrast" label="Increase contrast" checked={contrast} onCheckedChange={setContrast} />
      </PreferencesGroup>
      <PreferencesGroup title="Navigation">
        <PreferenceSwitch id="keepOpen" label="Keep menu open" checked={keepOpen} onCheckedChange={setKeepOpen} />
      </PreferencesGroup>
    </div>
  );
}

const meta = { title: 'navigation/PreferencesGroup', component: Groups, parameters: { layout: 'centered' } } satisfies Meta<typeof Groups>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A group title is a heading for assistive tech only, and each switch is named by its label. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Navigation' })).toBeInTheDocument();
    await expect(canvas.getByRole('switch', { name: 'Dark mode' })).toBeInTheDocument();
  },
};
