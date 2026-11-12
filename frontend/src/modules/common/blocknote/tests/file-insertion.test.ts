// @vitest-environment jsdom
import { BlockNoteEditor } from '@blocknote/core';
import type { Attachment } from 'sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/query/query-client', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return { queryClient: new QueryClient() };
});
const uploadAttachmentFiles = vi.fn();
vi.mock('~/modules/attachment/helpers/upload-file', () => ({ uploadAttachmentFiles: (files: File[]) => uploadAttachmentFiles(files) }));
vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: { error: vi.fn() } }));

const { customSchema } = await import('~/modules/common/blocknote/blocknote-schema');
const { insertFiles } = await import('~/modules/common/blocknote/custom-file-panel/file-insertion');
const { isMediaBlock } = await import('~/modules/common/blocknote/types');

const organizationId = '0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b';
const rowIds = ['0199a1b2-c3d4-7e5f-8a6b-000000000001', '0199a1b2-c3d4-7e5f-8a6b-000000000002'];
const files = [new File(['first line'], 'notes.txt', { type: 'text/plain' }), new File(['\u0000'], 'data.bin', { type: 'application/octet-stream' })];

const rowOf = (id: string, file: File) =>
  ({
    id,
    filename: file.name,
    contentType: file.type,
    size: file.size,
    keys: { original: `${organizationId}/user/${file.name}` },
    publicBucket: false,
  }) as Attachment;

const createEditor = () => BlockNoteEditor.create({ schema: customSchema, _headless: true });
const mediaProps = (editor: ReturnType<typeof createEditor>) => editor.document.filter(isMediaBlock).map(({ props }) => props);

describe('insertFiles', () => {
  // A block body: `mockReset()` returns the mock, which a hook would run as its cleanup.
  beforeEach(() => {
    uploadAttachmentFiles.mockReset();
  });

  it('must not name an attachment in a block before its row exists', async () => {
    const editor = createEditor();
    uploadAttachmentFiles.mockResolvedValue(files.map((file, index) => rowOf(rowIds[index], file)));
    let rowsExist = () => {};
    const persist = vi.fn(() => new Promise<void>((resolve) => (rowsExist = resolve)));

    const inserted = insertFiles(editor, files, { organizationId, tenantId: 'tenant-1', upload: { mediaMode: 'private-attachment', persist } });

    // Each file is in the document at once, by name.
    expect(mediaProps(editor).map(({ name }) => name)).toEqual(['notes.txt', 'data.bin']);
    await vi.waitFor(() => expect(persist).toHaveBeenCalled());
    expect(mediaProps(editor).map(({ attachmentId, url }) => attachmentId || url)).toEqual(['', '']);

    rowsExist();
    await inserted;
    expect(mediaProps(editor).map(({ attachmentId, url }) => [attachmentId, url])).toEqual(rowIds.map((id) => [id, id]));
    expect(mediaProps(editor)[0].excerpt).toBe('first line');
  });

  it('takes its blocks out again when the upload fails', async () => {
    const editor = createEditor();
    uploadAttachmentFiles.mockRejectedValue(new Error('refused'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const persist = vi.fn();

    await insertFiles(editor, files, { organizationId, tenantId: 'tenant-1', upload: { mediaMode: 'private-attachment', persist } });

    expect(mediaProps(editor)).toEqual([]);
    expect(persist).not.toHaveBeenCalled();
    logged.mockRestore();
  });
});
