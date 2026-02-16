import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SelectEmails } from '~/modules/common/form-fields/select-emails';

/**
 * Email input component with multi-email support, validation, and paste handling.
 * Built on top of TagInput with email-specific validation and delimiter support.
 */
const meta: Meta<typeof SelectEmails> = {
  title: 'common/SelectEmails',
  component: SelectEmails,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof SelectEmails>;

export default meta;

type Story = StoryObj<typeof SelectEmails>;

/**
 * Default email input with basic functionality.
 */
export const Default: Story = {
  render: () => {
    const [emails, setEmails] = useState(['user@example.com', 'test@domain.org']);
    return (
      <div className="w-80">
        <SelectEmails emails={emails} onChange={setEmails} placeholder="Add email addresses..." />
      </div>
    );
  },
};

/**
 * Empty email input ready for user input.
 */
export const Empty: Story = {
  render: () => {
    const [emails, setEmails] = useState<string[]>([]);
    return (
      <div className="w-80">
        <SelectEmails emails={emails} onChange={setEmails} placeholder="Enter email addresses..." />
      </div>
    );
  },
};

/**
 * Email input with display name support.
 * Accepts emails in format "Name <email@domain.com>".
 */
export const WithDisplayName: Story = {
  render: () => {
    const [emails, setEmails] = useState(['John Doe <john@example.com>', 'jane@example.com']);
    return (
      <div className="w-96">
        <SelectEmails
          emails={emails}
          onChange={setEmails}
          allowDisplayName
          placeholder="Name <email> or just email..."
        />
      </div>
    );
  },
};

/**
 * Email input that strips display names to extract only the email address.
 */
export const StripDisplayName: Story = {
  render: () => {
    const [emails, setEmails] = useState<string[]>([]);
    return (
      <div className="w-96">
        <SelectEmails
          emails={emails}
          onChange={(newEmails) => {
            console.info('Emails:', newEmails);
            setEmails(newEmails);
          }}
          allowDisplayName
          stripDisplayName
          placeholder="Try: John Doe <john@example.com>"
        />
        <p className="text-xs text-muted-foreground mt-2">
          Display names are stripped, only email addresses are stored.
        </p>
      </div>
    );
  },
};

/**
 * Email input allowing duplicate entries.
 */
export const AllowDuplicates: Story = {
  render: () => {
    const [emails, setEmails] = useState(['user@example.com']);
    return (
      <div className="w-80">
        <SelectEmails emails={emails} onChange={setEmails} allowDuplicate placeholder="Duplicates allowed..." />
        <p className="text-xs text-muted-foreground mt-2">Try adding the same email twice.</p>
      </div>
    );
  },
};

/**
 * Email input with maximum tag limit.
 */
export const WithMaxEmails: Story = {
  render: () => {
    const [emails, setEmails] = useState(['first@example.com', 'second@example.com']);
    return (
      <div className="w-80">
        <SelectEmails
          emails={emails}
          onChange={setEmails}
          maxTags={5}
          showCount
          placeholder="Add up to 5 emails..."
          placeholderWhenFull="Maximum emails reached"
        />
      </div>
    );
  },
};

/**
 * Email input with custom styling.
 */
export const CustomStyling: Story = {
  render: () => {
    const [emails, setEmails] = useState(['styled@example.com']);
    return (
      <div className="w-80">
        <SelectEmails
          emails={emails}
          onChange={setEmails}
          placeholder="Styled emails..."
          badgeVariants={{ variant: 'outline' }}
          styleClasses={{
            tag: {
              body: 'bg-blue-50 text-blue-800 border-blue-200',
              closeButton: 'text-blue-600 hover:text-blue-800',
            },
          }}
        />
      </div>
    );
  },
};

/**
 * Email input demonstrating paste functionality.
 * Try pasting: "test1@example.com, test2@example.com; test3@example.com"
 */
export const PasteMultiple: Story = {
  render: () => {
    const [emails, setEmails] = useState<string[]>([]);
    return (
      <div className="w-96">
        <SelectEmails emails={emails} onChange={setEmails} placeholder="Paste multiple emails..." />
        <p className="text-xs text-muted-foreground mt-2">
          Try pasting: test1@example.com, test2@example.com; test3@example.com
        </p>
      </div>
    );
  },
};

/**
 * Email input with event callbacks.
 */
export const WithCallbacks: Story = {
  render: () => {
    const [emails, setEmails] = useState<string[]>([]);
    return (
      <div className="w-80">
        <SelectEmails
          emails={emails}
          onChange={setEmails}
          onTagAdd={(email) => console.info('Added:', email)}
          onTagRemove={(email) => console.info('Removed:', email)}
          onInputChange={(value) => console.info('Input:', value)}
          placeholder="Check console for events..."
        />
      </div>
    );
  },
};
