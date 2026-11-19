import { generateId } from 'shared/utils/entity-id';
import { describe, expect, it, vi } from 'vitest';
import { ltiTabClosure } from '#/modules/lti-platform/helpers/context-channel';

// The template's answers in the files an app fills: an app's own answers leave these tests as they are.
vi.mock('#/modules/lti-platform/launch-context', async (importOriginal) =>
  (await import('./lti-template-answers')).templateLaunchContext(await importOriginal()),
);

const channelId = generateId();
const open = {
  link: { enabled: true, channelType: 'organization' as const, channelId },
  account: { status: 'active' as const },
  installation: { approvedAt: new Date().toISOString(), channelTypes: ['organization' as const] },
  archivedChannelIds: new Set<string>(),
};

// Attack: every use of a tab asks the one predicate, and each state that closes a tab closes it without a write. The
// archive cannot be staged in the template, which archives no channel: it is checked here, beside the others.
describe('ltiTabClosure', () => {
  it.each([
    ['a tab that is on, of an approved and active LTI tool allowed in an open channel', open, null],
    ['a tab switched off', { ...open, link: { ...open.link, enabled: false } }, 'lti_tab_switched_off'],
    ['an LTI tool waiting for approval', { ...open, installation: { ...open.installation, approvedAt: null } }, 'lti_installation_not_active'],
    ['a disabled LTI tool', { ...open, account: { status: 'disabled' as const } }, 'lti_installation_not_active'],
    ['a channel type taken away', { ...open, installation: { ...open.installation, channelTypes: [] } }, 'lti_channel_type_not_allowed'],
    ['an archived channel', { ...open, archivedChannelIds: new Set([channelId]) }, 'channel_archived'],
  ])('answers %s', (_case, facts, closure) => {
    expect(ltiTabClosure(facts)).toBe(closure);
  });
});
