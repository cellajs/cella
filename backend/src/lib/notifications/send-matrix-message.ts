import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import { env } from '#/env';
import { log } from '#/utils/logger';

// TODO-032(IMPROVEMENT) [#06] handle all matrix/element message types
// export type matrixMsgTypes = 'm.text', 'm.notice', 'm.emote', 'm.image', 'm.audio', 'm.video', 'm.file', 'm.location', 'm.sticker'

type MatrixMsgTypes = 'm.text' | 'm.notice';

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
    log.info('Missing required Element env values (roomId and/or  botAccessToken).');
    return;
  }
  const bodyPayload: Record<string, unknown> = {
    msgtype,
    body: textMessage,
    ...(html ? { format: 'org.matrix.custom.html', formatted_body: html } : {}),
  };

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
    log.info('Matrix message sent successfully to specified room');
  } else {
    const errorBody = await matrixResponse.json();
    log.error('Failed to send Matrix message', { err: errorBody });
  }
  return matrixResponse;
};
