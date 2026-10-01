import { generateId } from 'shared/utils/entity-id';
import { describe, expect, it, vi } from 'vitest';
import { type ActivityEvent, activityBus } from '#/lib/activity-bus';
import { fanOutNotifications } from './operations/fan-out';
import { sendPendingInstantEmails } from './operations/send-instant-emails';
import './notification-listeners';

vi.mock('./operations/fan-out', () => ({ fanOutNotifications: vi.fn() }));
vi.mock('./operations/send-instant-emails', () => ({ sendPendingInstantEmails: vi.fn(async () => undefined) }));

/** A product write as the CDC worker delivers it; the listener reads only these fields. */
const productWrite = (): ActivityEvent =>
  ({
    id: `act:${generateId()}`,
    type: 'attachment.updated',
    action: 'update',
    entityType: 'attachment',
    subjectId: generateId(),
    organizationId: generateId(),
    tenantId: 'tenant1',
  }) as unknown as ActivityEvent;

/** Emits the write and waits until the listener has settled. */
const deliver = async (event: ActivityEvent) => {
  activityBus.emit(event);
  await vi.waitFor(() => expect(fanOutNotifications).toHaveBeenCalledWith(event));
  await new Promise((resolve) => setImmediate(resolve));
};

describe('notification listeners', () => {
  it('runs the instant email pass for the organization after the fan-out wrote a mention', async () => {
    vi.mocked(fanOutNotifications).mockResolvedValueOnce(true);
    const event = productWrite();
    await deliver(event);
    expect(sendPendingInstantEmails).toHaveBeenCalledExactlyOnceWith(event.organizationId);
  });

  it('skips the email pass for a write that added no mention (no source, no recipient, an edit)', async () => {
    vi.mocked(fanOutNotifications).mockResolvedValueOnce(false);
    await deliver(productWrite());
    expect(sendPendingInstantEmails).not.toHaveBeenCalled();
  });
});
