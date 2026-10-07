// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { GetUserResponse } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const { UserProfileSubline } = await import('~/modules/user/user-profile-subline');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const baseUser: GetUserResponse = {
  id: '00000000-0000-7000-8000-000000000001',
  name: 'Ada Lovelace',
  slug: 'ada',
  email: 'ada@example.com',
  description: null,
  thumbnailUrl: null,
  bannerUrl: null,
  entityType: 'user',
  createdAt: '2026-01-05T10:00:00.000Z',
  updatedAt: null,
  lastSeenAt: null,
};

let root: Root | undefined;
let container: HTMLDivElement;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

async function renderSubline(user: GetUserResponse) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<UserProfileSubline user={user} />));
  return container;
}

describe('User profile subline', () => {
  it('shows the email address as a mail link, and no MFA setting when the API withheld it', async () => {
    const el = await renderSubline(baseUser);

    expect(el.querySelector('a')?.getAttribute('href')).toBe('mailto:ada@example.com');
    expect(el.textContent).not.toContain('c:mfa_');
  });

  it('shows the MFA setting next to the email address when the API returned it, on or off', async () => {
    expect((await renderSubline({ ...baseUser, mfaRequired: true })).textContent).toContain('c:mfa_on');
    await act(async () => root?.unmount());
    container.remove();

    expect((await renderSubline({ ...baseUser, mfaRequired: false })).textContent).toContain('c:mfa_off');
  });
});
