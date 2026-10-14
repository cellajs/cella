import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { PreferenceSwitch, PreferencesGroup } from '~/modules/navigation/menu-sheet/preferences-group';

function Group() {
  const [dark, setDark] = useState(false);
  const [keep, setKeep] = useState(true);
  return (
    <div className="w-72">
      <PreferencesGroup title="Appearance" help>
        <PreferenceSwitch id="dark" label="Dark mode" description="Use a dark color scheme." checked={dark} onCheckedChange={setDark} />
        <PreferenceSwitch
          id="keep"
          label="Keep messages open"
          description="Notifications stay until closed."
          checked={keep}
          onCheckedChange={setKeep}
        />
      </PreferencesGroup>
    </div>
  );
}

const meta = { title: 'navigation/PreferencesGroup', component: Group, parameters: { layout: 'centered' } } satisfies Meta<typeof Group>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The group's help toggle opens every switch description at once and closes them again. */
export const HelpToggle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = canvasElement.querySelector<HTMLElement>('.group\\/prefs');
    const toggle = canvas.getByRole('button', { expanded: false });
    const description = canvas.getByText('Use a dark color scheme.');

    await expect(canvas.getByRole('switch', { name: 'Dark mode' })).toHaveAccessibleDescription('Use a dark color scheme.');
    await expect(group).toHaveAttribute('data-help-open', 'false');

    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(group).toHaveAttribute('data-help-open', 'true');
    await waitFor(() => expect(getComputedStyle(description.closest('.grid') as Element).opacity).toBe('1'));

    await userEvent.click(toggle);
    await waitFor(() => expect(getComputedStyle(description.closest('.grid') as Element).opacity).toBe('0'));
  },
};
