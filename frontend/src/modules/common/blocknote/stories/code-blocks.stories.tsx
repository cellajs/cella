import type { Meta, StoryObj } from '@storybook/react-vite';
import type { codeBlockConfig } from 'shared/utils/blocknote-schema-configs';
import { expect, waitFor } from 'storybook/test';
import { BlockNote } from '~/modules/common/blocknote/blocknote-editor';
import { withApp } from '~/stories/with-app';

type Language = keyof typeof codeBlockConfig.supportedLanguages;

const samples: Record<Language, string> = {
  text: 'Plain text renders without highlighting.',
  html: '<section class="card">\n  <style>.card { color: rebeccapurple; }</style>\n  <h2 id="notes">Release notes</h2>\n  <script>document.getElementById("notes").hidden = false;</script>\n</section>',
  javascript: 'const total = items.reduce((sum, item) => sum + item.price, 0);\nexport default total;',
  json: '{ "name": "launch", "private": true, "steps": [1, 2, 3] }',
  jsonc: '{\n  // Comments are allowed here\n  "strict": true\n}',
  markdown: '# Release notes\n\nSome **bold** text and a [link](https://example.com).\n\n- first item',
  typescript: 'interface User {\n  id: string;\n  name: string;\n}\n\nexport const greet = (user: User): string => `Hello ${user.name}`;',
};

const codeBlock = (language: string, text: string) => ({
  id: `code-${language}`,
  type: 'codeBlock',
  props: { language },
  content: [{ type: 'text', text, styles: {} }],
  children: [],
});

const allLanguages = JSON.stringify(Object.entries(samples).map(([language, text]) => codeBlock(language, text)));

/** Code blocks in the editor, highlighted in the languages `codeBlockConfig` allows. */
const meta = {
  title: 'common/blocknote/CodeBlocks',
  component: BlockNote,
  decorators: [withApp],
  parameters: { layout: 'padded' },
  args: { id: 'code-blocks', defaultValue: allLanguages, updateData: () => {}, sideMenu: false },
} satisfies Meta<typeof BlockNote>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Token spans BlockNote's highlighter adds inside the code block of `language`. */
const tokens = (canvasElement: HTMLElement, language: string) =>
  canvasElement.querySelectorAll(`[data-id="code-${language}"] [data-content-type="codeBlock"] code span[style*="color"]`);

/** Waits until every language but plain text is highlighted. */
const expectHighlighted = async (canvasElement: HTMLElement) => {
  for (const language of Object.keys(samples).filter((language) => language !== 'text')) {
    await waitFor(() => expect(tokens(canvasElement, language).length).toBeGreaterThan(1), { timeout: 10_000 });
  }
  await expect(tokens(canvasElement, 'text').length).toBe(0);
};

/** One code block per supported language. */
export const AllLanguages: Story = {
  play: async ({ canvasElement }) => expectHighlighted(canvasElement),
};

/** A read-only editor highlights the same way. */
export const ReadOnly: Story = {
  args: { editable: false },
  play: async ({ canvasElement }) => expectHighlighted(canvasElement),
};
