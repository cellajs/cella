import { appConfig } from 'shared';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { sendToSystemRoom } from '#/lib/system-room';
import { requestReceivedEmail } from '../../emails';
import { mailsTo, sentMails } from '../../tests/helpers';

// Set ahead of every import: the env is read when the first module imports it.
const token = vi.hoisted(() => {
  process.env.MATRIX_ACCESS_TOKEN = 'test-matrix-token';
  return process.env.MATRIX_ACCESS_TOKEN;
});
const roomId = '!system:matrix.test';
appConfig.matrix = { homeserverUrl: 'https://matrix.test', systemRoomId: roomId };

const request = { kind: 'contact' as const, email: 'anna@school.example', subject: 'Contact request' };
const stubbedFetch = vi.mocked(fetch).getMockImplementation();

interface SendCall {
  url: string;
  authorization: string | null;
  content: Record<string, unknown>;
}

/** A homeserver whose bot is in an unencrypted room and that answers every send with `sendAnswer`. Records the sends. */
const homeserver = (sendAnswer: () => Response) => {
  const sends: SendCall[] = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/joined_rooms')) return Response.json({ joined_rooms: [roomId] });
    if (url.endsWith('/state/m.room.encryption')) return Response.json({ errcode: 'M_NOT_FOUND' }, { status: 404 });
    sends.push({ url, authorization: new Headers(init?.headers).get('authorization'), content: JSON.parse(String(init?.body)) });
    return sendAnswer();
  });
  return sends;
};

afterEach(() => {
  if (stubbedFetch) vi.mocked(fetch).mockImplementation(stubbedFetch);
});

afterAll(() => {
  delete process.env.MATRIX_ACCESS_TOKEN;
});

describe('sendToSystemRoom', () => {
  it('posts typed markup as text, mentions no one, keeps the token out of the URL and sends no mail', async () => {
    const sends = homeserver(() => Response.json({ event_id: '$event' }));
    const message = '<script>alert(1)</script> <a href="https://evil.example">click</a> @room';

    await sendToSystemRoom(requestReceivedEmail, { ...request, message }, request.email);

    expect(sends).toHaveLength(1);
    const [{ url, authorization, content }] = sends;
    expect(url).not.toContain(token);
    expect(authorization).toBe(`Bearer ${token}`);
    expect(content.msgtype).toBe('m.text');
    expect(content['m.mentions']).toEqual({});
    expect(content.formatted_body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(content.formatted_body).not.toContain('<script');
    expect(content.formatted_body).not.toContain('href="https://evil.example"');
    expect(sentMails()).toHaveLength(0);
  });

  it('mails the message with the reason when the homeserver refuses the token', async () => {
    const sends = homeserver(() => Response.json({ errcode: 'M_UNKNOWN_TOKEN' }, { status: 401 }));

    await sendToSystemRoom(requestReceivedEmail, { ...request, message: 'Hello' }, request.email);

    // A refused token is no reason to try again.
    expect(sends).toHaveLength(1);
    const mails = mailsTo(appConfig.company.email);
    expect(mails).toHaveLength(1);
    expect(mails[0].statics.deliveryNote).toContain('M_UNKNOWN_TOKEN');
  });
});
