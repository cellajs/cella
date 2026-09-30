import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, spyOn, userEvent, within } from 'storybook/test';
import { SelectEmails } from '~/modules/common/form-fields/select-emails';
import { toaster } from '~/modules/common/toaster/toaster';

/**
 * Email chip input of the invite form: typed or pasted addresses become chips when an invite submit would accept them.
 */
const meta: Meta<typeof SelectEmails> = {
  title: 'common/SelectEmails',
  component: SelectEmails,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  beforeEach: () => {
    const warning = spyOn(toaster, 'warning');
    return () => warning.mockRestore();
  },
} satisfies Meta<typeof SelectEmails>;

export default meta;

type Story = StoryObj<typeof SelectEmails>;

/**
 * Default email input with basic functionality.
 */
export const Default: Story = {
  render: function Render() {
    const [emails, setEmails] = useState(['user@example.com', 'test@domain.org']);
    return (
      <div className="w-80">
        <SelectEmails emails={emails} onValueChange={setEmails} placeholder="Add email addresses..." />
      </div>
    );
  },
};

/**
 * Empty email input ready for user input.
 */
export const Empty: Story = {
  render: function Render() {
    const [emails, setEmails] = useState<string[]>([]);
    return (
      <div className="w-80">
        <SelectEmails emails={emails} onValueChange={setEmails} placeholder="Enter email addresses..." />
      </div>
    );
  },
};

/**
 * Email input demonstrating paste functionality.
 * Try pasting: "test1@example.com, test2@example.com; test3@example.com"
 */
export const PasteMultiple: Story = {
  render: function Render() {
    const [emails, setEmails] = useState<string[]>([]);
    return (
      <div className="w-96">
        <SelectEmails emails={emails} onValueChange={setEmails} placeholder="Paste multiple emails..." />
        <p className="mt-2 text-muted-foreground text-xs">
          Try pasting: test1@example.com, test2@example.com; test3@example.com
        </p>
      </div>
    );
  },
};

/** The field as the invite form uses it, inside a form that counts submits. */
function InviteEmailsField({ initial = [] }: { initial?: string[] }) {
  const [emails, setEmails] = useState(initial);
  const [submits, setSubmits] = useState(0);

  return (
    <form
      className="w-96"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmits((count) => count + 1);
      }}
    >
      <SelectEmails
        placeholder="Add an email"
        emails={emails}
        onValueChange={setEmails}
        inputProps={{ autoComplete: 'off' }}
      />
      <output>value: {JSON.stringify(emails)}</output>
      <p>submits: {submits}</p>
      <button type="submit">Invite</button>
    </form>
  );
}

const playTags = ['!dev', '!autodocs'];

export const ShouldCommitOnDelimiters: Story = {
  name: 'when Enter, comma, semicolon or space follows an address, should add it as a chip',
  tags: playTags,
  render: () => <InviteEmailsField />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox');

    await userEvent.type(input, 'a@x.com{Enter}');
    await userEvent.type(input, 'b@x.com,');
    await userEvent.type(input, 'c@x.com;');
    await userEvent.type(input, 'd@x.com ');

    await expect(canvas.getByText('value: ["a@x.com","b@x.com","c@x.com","d@x.com"]')).toBeVisible();
    for (const email of ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'])
      await expect(canvas.getByText(email)).toBeVisible();
    await expect(input).toHaveValue('');
    await expect(canvas.getByText('submits: 0')).toBeVisible();
  },
};

export const ShouldCommitOnBlur: Story = {
  name: 'when the input loses focus with an address, should add it as a chip',
  tags: playTags,
  render: () => <InviteEmailsField />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox');

    await userEvent.type(input, 'blur@x.com');
    await userEvent.tab();

    await expect(canvas.getByText('value: ["blur@x.com"]')).toBeVisible();
    await expect(input).toHaveValue('');
  },
};

export const ShouldRemoveChips: Story = {
  name: 'when Backspace is pressed on an empty input or a chip is closed, should remove that chip',
  tags: playTags,
  render: () => <InviteEmailsField initial={['a@x.com', 'b@x.com', 'c@x.com']} />,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox');

    await step('Backspace on an empty input removes the last chip', async () => {
      await userEvent.click(input);
      await userEvent.keyboard('{Backspace}');
      await expect(canvas.getByText('value: ["a@x.com","b@x.com"]')).toBeVisible();
      await expect(canvas.queryByText('c@x.com')).not.toBeInTheDocument();
    });

    await step('Backspace inside typed text only edits the text', async () => {
      await userEvent.type(input, 'ab{Backspace}');
      await expect(input).toHaveValue('a');
      await expect(canvas.getByText('value: ["a@x.com","b@x.com"]')).toBeVisible();
      await userEvent.clear(input);
    });

    await step('the close button of a chip removes that chip', async () => {
      await userEvent.click(within(canvas.getByText('a@x.com')).getByRole('button'));
      await expect(canvas.getByText('value: ["b@x.com"]')).toBeVisible();
    });
  },
};

export const ShouldIgnoreCaseDuplicates: Story = {
  name: 'when an address differs from a chip only in case, should keep one chip',
  tags: playTags,
  render: () => <InviteEmailsField initial={['a@x.com']} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.type(canvas.getByRole('textbox'), 'A@X.COM{Enter}');

    await expect(canvas.getByText('value: ["a@x.com"]')).toBeVisible();
    await expect(canvas.queryByText('A@X.COM')).not.toBeInTheDocument();
  },
};

export const ShouldNotSubmitOnEnter: Story = {
  name: 'when Enter is pressed on an empty input, should not submit the form',
  tags: playTags,
  render: () => <InviteEmailsField initial={['a@x.com']} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.type(canvas.getByRole('textbox'), '{Enter}');

    await expect(canvas.getByText('submits: 0')).toBeVisible();
    await expect(canvas.getByText('value: ["a@x.com"]')).toBeVisible();
  },
};

export const ShouldRejectInvalid: Story = {
  name: 'when the typed text is not an email address, should warn and add no chip',
  tags: playTags,
  render: () => <InviteEmailsField />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox');

    await userEvent.type(input, 'not-an-email{Enter}');

    await expect(toaster.warning).toHaveBeenCalledTimes(1);
    await expect(canvas.getByText('value: []')).toBeVisible();
    await expect(input).toHaveValue('not-an-email');
    await expect(canvas.getByText('submits: 0')).toBeVisible();
  },
};

export const ShouldFollowSubmitRule: Story = {
  name: 'when an address is typed, should accept it as a chip exactly when the invite submit would',
  tags: playTags,
  render: () => <InviteEmailsField />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox');

    await userEvent.type(input, 'jöhn@example.com{Enter}');
    await expect(toaster.warning).toHaveBeenCalledTimes(1);
    await expect(canvas.getByText('value: []')).toBeVisible();

    await userEvent.clear(input);
    await userEvent.type(input, 'user@example-.com{Enter}');
    await expect(canvas.getByText('value: ["user@example-.com"]')).toBeVisible();
  },
};

export const ShouldKeepEveryPastedAddress: Story = {
  name: 'when several addresses are pasted, should add each of them as a chip',
  tags: playTags,
  render: () => <InviteEmailsField initial={['first@x.com']} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox');

    await userEvent.click(input);
    await userEvent.paste('a@x.com, b@x.com; c@x.com');

    await expect(canvas.getByText('value: ["first@x.com","a@x.com","b@x.com","c@x.com"]')).toBeVisible();
    await expect(input).toHaveValue('');
  },
};

export const ShouldKeepInvalidPastedText: Story = {
  name: 'when a pasted list holds an invalid address, should add the others and leave it in the input',
  tags: playTags,
  render: () => <InviteEmailsField />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox');

    await userEvent.click(input);
    await userEvent.paste('a@x.com, nope, c@x.com');

    await expect(canvas.getByText('value: ["a@x.com","c@x.com"]')).toBeVisible();
    await expect(toaster.warning).toHaveBeenCalled();
    await expect(input).toHaveValue('nope');
  },
};

export const ShouldLabelRemoveButtons: Story = {
  name: 'when chips render, should give each remove button an accessible name',
  tags: playTags,
  render: () => <InviteEmailsField initial={['a@x.com', 'b@x.com']} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    for (const email of ['a@x.com', 'b@x.com']) {
      await expect(within(canvas.getByText(email)).getByRole('button')).toHaveAccessibleName();
    }
  },
};
