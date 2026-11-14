import { randomUUID } from 'node:crypto';
import { appConfig } from 'shared';
import { sleep } from 'shared/utils/sleep';
import { env } from '#/env';
import { mailer } from '#/lib/mailer';
import { isEncrypted, join, joinedRooms, type MatrixBot, send, whoami } from '#/lib/matrix';
import { currentRequestDetails } from '#/lib/request-details';
import { log } from '#/utils/logger';
import { type DeliveryNoteStatic, renderChatText } from '../../emails/chat-text';
import { i18n } from '../../emails/i18n';
import type { EmailTemplateDef } from '../../emails/types';

const maxTries = 3;
// Waits before the second and the third try, unless a 429 names its own.
const retryWaitsMs = [1000, 3000];
// A 429 that asks for longer goes to the mail at once: the operator hears sooner that way.
const maxRetryAfterMs = 10_000;

interface SystemRoom {
  bot: MatrixBot;
  roomId: string;
}

/** The system room and the bot that posts into it; null where the config or the token is absent. */
const systemRoom = (): SystemRoom | null => {
  const { matrix } = appConfig;
  const accessToken = env.MATRIX_ACCESS_TOKEN;
  return matrix && accessToken ? { bot: { homeserverUrl: matrix.homeserverUrl, accessToken }, roomId: matrix.systemRoomId } : null;
};

// Remembered for the process once the room took the bot: a later 403 on a send joins again.
let connected = false;

/**
 * Makes the bot a member of the room, accepting its own invite, and checks that the room has no encryption.
 * @returns Null when the room takes messages, or the reason it does not: an `errcode` of `lib/matrix`, or `encrypted`.
 */
async function connect({ bot, roomId }: SystemRoom): Promise<string | null> {
  if (connected) return null;

  const rooms = await joinedRooms(bot);
  if (!rooms.ok) return rooms.errcode;
  if (!rooms.data.joined_rooms.includes(roomId)) {
    const joined = await join(bot, roomId);
    if (!joined.ok) return joined.errcode;
  }

  const encrypted = await isEncrypted(bot, roomId);
  if (!encrypted.ok) return encrypted.errcode;
  if (encrypted.data) return 'encrypted';

  connected = true;
  return null;
}

/**
 * Posts one message. Every try carries the same transaction id: the room never shows it twice.
 * @returns Null once the room took the message, or the reason it did not.
 */
async function post(room: SystemRoom, content: object): Promise<string | null> {
  const refused = await connect(room);
  if (refused) return refused;

  const { bot, roomId } = room;
  const txnId = randomUUID();
  let rejoined = false;

  for (let attempt = 1; ; attempt++) {
    const sent = await send(bot, roomId, txnId, content);
    if (sent.ok) return null;

    // The spec names no error for a sender outside the room: any 403 is read as "removed", and an invite lets the bot back in.
    if (sent.status === 403 && !rejoined) {
      rejoined = true;
      if (!(await join(bot, roomId)).ok) return sent.errcode;
      continue;
    }

    const retryable = sent.status === null || sent.status === 429 || sent.status >= 500;
    const wait = sent.retryAfterMs ?? retryWaitsMs[attempt - 1];
    if (!retryable || attempt >= maxTries || wait > maxRetryAfterMs) return sent.errcode;
    await sleep(wait);
  }
}

/**
 * Tells the operator of something the app did or received: in the system room, or by mail to `company.email` when the
 * app has no room, the template has no chat text, or the room could not be reached. That mail ends with the reason.
 * @param replyTo - The address a reply to the mail goes to.
 * @throws What the mailer throws when the mail fails too.
 */
export async function sendToSystemRoom<TStatic extends DeliveryNoteStatic>(
  template: EmailTemplateDef<TStatic>,
  statics: NoInfer<TStatic>,
  replyTo?: string,
): Promise<void> {
  const lng = appConfig.defaultLanguageCode;
  const mail = (mailStatics: TStatic) => mailer.sendEmails(template, mailStatics, [{ email: appConfig.company.email, lng }], replyTo);

  const room = systemRoom();
  const { chat } = template;
  if (!room || !chat) return mail(statics);

  let reason: string | null;
  try {
    reason = await post(room, renderChatText(chat(lng, statics, await currentRequestDetails())));
  } catch (err) {
    // A fault in a chat text never costs the operator the message.
    log.error('System room message failed', { err });
    reason = 'error';
  }
  if (!reason) return;

  log.warn('System room send failed', { reason, fallback: 'mail' });
  await mail({ ...statics, deliveryNote: i18n.t('backend:email.delivery_note', { reason, lng }) });
}

/**
 * Connects at start-up: the log then says whether the room takes messages, before the first one is due. Posts nothing,
 * never throws, and does nothing where the app has no room.
 */
export async function connectSystemRoom(): Promise<void> {
  const room = systemRoom();
  if (!room) return;

  const reason = await connect(room);
  if (reason) {
    log.warn('System room not connected', { reason });
    return;
  }
  const account = await whoami(room.bot);
  log.info(`System room connected${account.ok ? ` as ${account.data.user_id}` : ''}`);
}
