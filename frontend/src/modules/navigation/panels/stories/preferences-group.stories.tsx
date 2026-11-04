import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { PreferenceSwitch, PreferencesGroup } from '~/modules/navigation/panels/preferences-group';
import { HelpToggle } from '~/modules/ui/help-toggle';

// Stands in for the nav sheet panel, whose help toggle sits on its bar and sets `data-help-open` on its body
function Groups() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [contrast, setContrast] = useState(true);
  const [keepOpen, setKeepOpen] = useState(false);
  return (
    <div className="flex w-72 flex-col gap-4">
      <HelpToggle open={helpOpen} onToggle={() => setHelpOpen((prev) => !prev)} className="self-end" />
      <div data-help-open={helpOpen} className="group/help flex flex-col gap-4">
        <PreferencesGroup title="Appearance">
          <PreferenceSwitch id="dark" label="Dark mode" description="Use a dark color scheme." checked={dark} onCheckedChange={setDark} />
          <PreferenceSwitch
            id="contrast"
            label="Increase contrast"
            description="Stronger text and border colors."
            checked={contrast}
            onCheckedChange={setContrast}
          />
        </PreferencesGroup>
        <PreferencesGroup title="Navigation">
          <PreferenceSwitch
            id="keepOpen"
            label="Keep menu open"
            description="The menu stays beside the page."
            checked={keepOpen}
            onCheckedChange={setKeepOpen}
          />
        </PreferencesGroup>
      </div>
    </div>
  );
}

const meta = { title: 'navigation/PreferencesGroup', component: Groups, parameters: { layout: 'centered' } } satisfies Meta<typeof Groups>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every switch description in the help scope opens with its toggle and closes again; a group title is a heading for assistive tech only. */
export const HelpScope: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('button', { expanded: false });
    const description = canvas.getByText('Use a dark color scheme.');

    await expect(canvas.getByRole('heading', { name: 'Navigation' })).toBeInTheDocument();
    await expect(canvas.getByRole('switch', { name: 'Dark mode' })).toHaveAccessibleDescription('Use a dark color scheme.');

    await userEvent.click(toggle);
    await waitFor(() => expect(getComputedStyle(description.closest('.grid') as Element).opacity).toBe('1'));

    await userEvent.click(toggle);
    await waitFor(() => expect(getComputedStyle(description.closest('.grid') as Element).opacity).toBe('0'));
  },
};
