// @vitest-environment jsdom
import { BlockNoteEditor, type BlockNoteSchema } from '@blocknote/core';
import { serverBlockNoteSchema } from 'shared/utils/blocknote-server-schema';
import { expect, it, vi } from 'vitest';

vi.mock('~/query/query-client', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return { queryClient: new QueryClient() };
});

const { customSchema } = await import('~/modules/common/blocknote/blocknote-schema');

/** What a Y.Doc round trip reads of each ProseMirror node: its attributes with their defaults, its content and its group. */
const nodeShapes = (schema: BlockNoteSchema<any, any, any>) =>
  Object.fromEntries(
    Object.entries(BlockNoteEditor.create({ schema, _headless: true }).pmSchema.nodes).map(([name, { spec }]) => [
      name,
      {
        attrs: Object.fromEntries(Object.entries(spec.attrs ?? {}).map(([attr, { default: value }]) => [attr, value])),
        content: spec.content,
        group: spec.group,
      },
    ]),
  );

it('the editor and the server build the same ProseMirror nodes, so a document either side writes converts on the other', () => {
  expect(nodeShapes(customSchema)).toEqual(nodeShapes(serverBlockNoteSchema));
});
