import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Attachment } from 'sdk';
import { describe, expect, it, vi } from 'vitest';

type DeleteFormProps = { onDelete: () => void; allowOfflineDelete?: boolean; pending: boolean };
const { shown, mutation, removeDialog } = vi.hoisted(() => ({
  shown: {} as { form?: DeleteFormProps },
  // A delete queued offline: its promise settles only once the network is back.
  mutation: { mutate: vi.fn(), mutateAsync: vi.fn(() => new Promise<never>(() => {})), isPending: false },
  removeDialog: vi.fn(),
}));

vi.mock('~/modules/attachment/query', () => ({ useAttachmentDeleteMutation: () => mutation }));
vi.mock('~/modules/common/dialoger/use-dialoger', () => ({
  useDialoger: (select: (state: { remove: () => void }) => unknown) => select({ remove: removeDialog }),
}));
// The buttons are left out: the test presses delete by calling the handler the form was given.
vi.mock('~/modules/common/delete-form', () => ({
  DeleteForm: (props: DeleteFormProps) => {
    shown.form = props;
    return null;
  },
}));

const { DeleteAttachments } = await import('~/modules/attachment/delete-attachments');

const attachments = [{ id: 'att-1', tenantId: 'ten-1', organizationId: 'org-1' }] as Attachment[];

describe('DeleteAttachments', () => {
  it('deletes offline as its hook does: the form lets the press through, and the dialog closes without waiting for the server', async () => {
    const callback = vi.fn();
    renderToStaticMarkup(createElement(DeleteAttachments, { attachments, callback, dialog: true }));

    expect(shown.form?.allowOfflineDelete).toBe(true);
    shown.form?.onDelete();
    await Promise.resolve();

    expect(removeDialog).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ data: attachments, status: 'success' });
  });
});
