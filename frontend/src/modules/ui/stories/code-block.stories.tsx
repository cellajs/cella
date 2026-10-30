import type { Meta, StoryObj } from '@storybook/react-vite';
import { CodeCopyButton } from '~/modules/common/code-copy-button';
import { CodeBlock, CodeBlockActions, CodeBlockContent } from '~/modules/ui/code-block';

const code = `const organization = await createOrganization({ name: 'Acme' });
console.info(organization.id);`;

/**
 * Frame, copy button and `pre` for code, terminal output and logs. Highlighting stays with the caller, as build-time or client-side Shiki output.
 */
const meta: Meta = { title: 'ui/CodeBlock', component: CodeBlock, tags: ['autodocs'] } satisfies Meta;

export default meta;

type Story = StoryObj;

/**
 * Plain text with a copy button that shows on hover and focus, and always on a touch screen.
 */
export const Default: Story = {
  render: () => (
    <CodeBlock>
      <CodeBlockActions>
        <CodeCopyButton value={code} />
      </CodeBlockActions>
      <CodeBlockContent>
        <code>{code}</code>
      </CodeBlockContent>
    </CodeBlock>
  ),
};

/**
 * Long lines scroll inside the frame.
 */
export const LongLine: Story = {
  render: () => (
    <CodeBlock className="max-w-sm">
      <CodeBlockContent>
        <code>{code.repeat(3)}</code>
      </CodeBlockContent>
    </CodeBlock>
  ),
};
