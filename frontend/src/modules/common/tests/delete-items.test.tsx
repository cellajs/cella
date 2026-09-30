// @vitest-environment jsdom
import { onlineManager } from '@tanstack/react-query';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Organization, Request } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BaseUser } from '~/modules/user/types';

/** What happened, in order, plus the last delete form's props and every mutation's variables. */
const seen = vi.hoisted(() => ({
  events: [] as string[],
  mutations: [] as unknown[],
  form: undefined as { onDelete: () => void; onCancel: () => void; pending: boolean } | undefined,
}));

const deleteMutation = vi.hoisted(() => () => ({
  isPending: false,
  mutate: (variables: unknown, options?: { onSuccess?: (data: unknown, variables: unknown) => void }) => {
    seen.mutations.push(variables);
    options?.onSuccess?.(undefined, variables);
  },
}));

vi.mock('~/query/query-client', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return { queryClient: new QueryClient() };
});
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('~/modules/common/delete-form', () => ({
  DeleteForm: (props: typeof seen.form) => {
    seen.form = props;
    return null;
  },
}));
vi.mock('~/modules/common/dialoger/use-dialoger', () => {
  const state = { remove: () => seen.events.push('close') };
  const useDialoger = (select: (s: typeof state) => unknown) => select(state);
  return { useDialoger: Object.assign(useDialoger, { getState: () => state }) };
});
vi.mock('~/modules/common/toaster/toaster', () => ({
  toaster: { warning: (message: string) => seen.events.push(`warning ${message}`) },
}));
vi.mock('~/modules/user/query', () => ({ useUserDeleteMutation: deleteMutation }));
vi.mock('~/modules/organization/query', () => ({ useOrganizationDeleteMutation: deleteMutation }));
vi.mock('~/modules/requests/query', () => ({ useDeleteRequestMutation: deleteMutation }));

const { DeleteUsers } = await import('~/modules/user/delete-users');
const { DeleteOrganizations } = await import('~/modules/organization/delete-organizations');
const { DeleteRequests } = await import('~/modules/requests/delete-requests');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;

async function render(element: ReactElement) {
  root = createRoot(document.createElement('div'));
  await act(async () => root?.render(element));
  if (!seen.form) throw new Error('no delete form rendered');
  return seen.form;
}

const callback = (args: { status: string; data?: unknown }) => {
  seen.events.push(`callback ${args.status}`);
  if ('data' in args) seen.mutations.push({ callbackData: args.data });
};

afterEach(async () => {
  await act(async () => root?.unmount());
  seen.events.length = 0;
  seen.mutations.length = 0;
  seen.form = undefined;
  onlineManager.setOnline(true);
});

const users = [{ id: 'u1' }, { id: 'u2' }] as BaseUser[];
const organizations = [{ id: 'o1' }] as Organization[];
const requests = [{ id: 'r1' }] as Request[];

describe('DeleteUsers', () => {
  it('deletes, reports success and then closes the dialog', async () => {
    const form = await render(<DeleteUsers dialog users={users} callback={callback} />);

    await act(async () => form.onDelete());

    expect(seen.mutations).toEqual([users, { callbackData: users }]);
    expect(seen.events).toEqual(['callback success', 'close']);
    expect(form.pending).toBe(false);
  });

  it('outside a dialog reports success without closing', async () => {
    const form = await render(<DeleteUsers users={users} callback={callback} />);

    await act(async () => form.onDelete());

    expect(seen.events).toEqual(['callback success']);
  });

  it('warns and sends nothing while offline', async () => {
    onlineManager.setOnline(false);
    const form = await render(<DeleteUsers dialog users={users} callback={callback} />);

    await act(async () => form.onDelete());

    expect(seen.mutations).toEqual([]);
    expect(seen.events).toEqual(['warning c:action.offline.text']);
  });

  it('cancel settles, then closes only in a dialog', async () => {
    const inDialog = await render(<DeleteUsers dialog users={users} callback={callback} />);
    await act(async () => inDialog.onCancel());
    expect(seen.events).toEqual(['callback settle', 'close']);

    seen.events.length = 0;
    const inline = await render(<DeleteUsers users={users} callback={callback} />);
    await act(async () => inline.onCancel());
    expect(seen.events).toEqual(['callback settle']);
  });
});

describe('DeleteOrganizations', () => {
  it('deletes by id within the tenant, closes the dialog and then reports success', async () => {
    const form = await render(
      <DeleteOrganizations dialog tenantId="tenant-1" organizations={organizations} callback={callback} />,
    );

    await act(async () => form.onDelete());

    expect(seen.mutations).toEqual([
      { path: { tenantId: 'tenant-1' }, body: { ids: ['o1'] }, organizations },
      { callbackData: organizations },
    ]);
    expect(seen.events).toEqual(['close', 'callback success']);
  });

  it('sends while offline and reports success without closing outside a dialog', async () => {
    onlineManager.setOnline(false);
    const form = await render(
      <DeleteOrganizations tenantId="tenant-1" organizations={organizations} callback={callback} />,
    );

    await act(async () => form.onDelete());

    expect(seen.mutations).toHaveLength(2);
    expect(seen.events).toEqual(['callback success']);
  });

  it('cancel closes only in a dialog, then settles', async () => {
    const inDialog = await render(
      <DeleteOrganizations dialog tenantId="tenant-1" organizations={organizations} callback={callback} />,
    );
    await act(async () => inDialog.onCancel());
    expect(seen.events).toEqual(['close', 'callback settle']);

    seen.events.length = 0;
    const inline = await render(
      <DeleteOrganizations tenantId="tenant-1" organizations={organizations} callback={callback} />,
    );
    await act(async () => inline.onCancel());
    expect(seen.events).toEqual(['callback settle']);
  });
});

describe('DeleteRequests', () => {
  it('deletes, closes the dialog and then reports success', async () => {
    const form = await render(<DeleteRequests dialog requests={requests} callback={callback} />);

    await act(async () => form.onDelete());

    expect(seen.mutations).toEqual([requests, { callbackData: requests }]);
    expect(seen.events).toEqual(['close', 'callback success']);
  });

  it('outside a dialog reports success without closing', async () => {
    const form = await render(<DeleteRequests requests={requests} callback={callback} />);

    await act(async () => form.onDelete());

    expect(seen.events).toEqual(['callback success']);
  });

  it('cancel always closes the dialog and reports nothing', async () => {
    const inline = await render(<DeleteRequests requests={requests} callback={callback} />);
    await act(async () => inline.onCancel());

    expect(seen.events).toEqual(['close']);
  });
});
