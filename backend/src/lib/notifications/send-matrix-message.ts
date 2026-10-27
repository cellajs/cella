import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import { env } from '#/env';
import { log } from '#/utils/logger';

const matrixTimeoutMs = 10_000;

/**
 * Posts a plain-text notice to the team's Element room. Never throws: an unreachable server, a timeout and a refusal are
 * logged, and the caller falls back to another channel.
 * @param textMessage - The notice's text.
 * @returns Whether Matrix accepted the message; false when Element is not configured.
 */
export const sendMatrixMessage = async (textMessage: string): Promise<boolean> => {
  if (!env.ELEMENT_ROOM_ID || !env.ELEMENT_BOT_ACCESS_TOKEN) {
    log.info('Missing required Element env values (roomId and/or  botAccessToken).');
    return false;
  }

  const txnId = nanoid(6);
  const url = `${appConfig.matrixURL}/_matrix/client/v3/rooms/${env.ELEMENT_ROOM_ID}/send/m.room.message/${txnId}`;

  try {
    // The access token goes in a header: fetch spans record the full request URL.
    const matrixResponse = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.ELEMENT_BOT_ACCESS_TOKEN}` },
      body: JSON.stringify({ msgtype: 'm.notice', body: textMessage }),
      signal: AbortSignal.timeout(matrixTimeoutMs),
    });
    if (matrixResponse.ok) {
      log.info('Matrix message sent successfully to specified room');
      return true;
    }
    log.error('Failed to send Matrix message', { status: matrixResponse.status, body: await matrixResponse.text().catch(() => '') });
  } catch (err) {
    log.error('Failed to send Matrix message', { err });
  }
  return false;
};
