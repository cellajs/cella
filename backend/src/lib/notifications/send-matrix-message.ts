import { appConfig } from 'config';
import { env } from '#/env';
import { logError, logEvent } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';

// TODO(IMPROVEMENT) handle all matrix/element message types
// export type matrixMsgTypes = 'm.text', 'm.notice', 'm.emote', 'm.image', 'm.audio', 'm.video', 'm.file', 'm.location', 'm.sticker'

type MatrixMsgTypes = 'm.text' | 'm.notice';

/**
 * Sends a Element message via Matrix API to.
 */
export const sendMatrixMessage = async ({
  msgtype,
  textMessage,
  html,
}: {
  msgtype: MatrixMsgTypes;
  textMessage: string;
  html?: string;
}) => {
  if (!env.ELEMENT_ROOM_ID || !env.ELEMENT_BOT_ACCESS_TOKEN) {
    logEvent('info', 'Missing required Element env values (roomId and/or  botAccessToken).');
    return;
  }
  // Construct payload
  const bodyPayload: any = {
    msgtype,
    body: textMessage,
    ...(html ? { format: 'org.matrix.custom.html', formatted_body: html } : {}),
  };

  // Build Matrix send message URL
  const txnId = nanoid(6);
  const roomId = env.ELEMENT_ROOM_ID;
  const botAccessToken = env.ELEMENT_BOT_ACCESS_TOKEN;
  const eventType = 'm.room.message';

  const url = `${appConfig.matrixURL}/_matrix/client/v3/rooms/${roomId}/send/${eventType}/${txnId}?access_token=${botAccessToken}`;

  const matrixResponse = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyPayload),
  });

  if (matrixResponse.ok) {
    logEvent('info', 'Matrix message sent successfully to specified room');
  } else {
    const errorBody = await matrixResponse.json();
    logError('Failed to send Matrix message', errorBody);
  }
  return matrixResponse;
};
