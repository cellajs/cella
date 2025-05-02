import { systemHc } from '#/modules/system/hc';
import { config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';

export const client = systemHc(config.backendUrl, clientConfig);

export interface SystemInviteProps {
  emails: string[];
  role: 'user';
}

/**
 * Sends invitations to users via email.
 *
 * @param values - Invitation details.
 * @param values.emails - An array of email addresses to invite.
 * @param values.role - Role assigned to invited users ('user').
 * @returns A promise that resolves when invitations are successfully sent.
 */
export const invite = async (values: SystemInviteProps) => {
  const response = await client.invite.$post({
    json: values,
  });

  await handleResponse(response);
};

type NewsletterBody = Parameters<(typeof client)['newsletter']['$post']>['0']['json'];

/**
 * Send a newsletter to organizations.
 *
 * @param body NewsletterBody - The newsletter details.
 * @param toSelf - A flag to determine if the newsletter should be sent to the sender only.
 * @returns A boolean indicating whether the newsletter was successfully sent.
 */
export const sendNewsletter = async ({ body, toSelf = false }: { body: NewsletterBody; toSelf: boolean }) => {
  const response = await client.newsletter.$post({
    json: body,
    query: { toSelf },
  });

  const json = await handleResponse(response);
  return json.success;
};

export const getPriasignedUrl = async ({ key }: { key: string }) => {
  const response = await client['preasigned-url'].$get({
    query: { key },
  });

  const json = await handleResponse(response);
  return json.data;
};
