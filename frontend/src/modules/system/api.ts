import { config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import { systemHc } from '#/modules/system/hc';

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

type NewsLetterBody = Parameters<(typeof client)['newsletter']['$post']>['0']['json'];

/**
 * Send a newsletter to organizations.
 *
 * @param body.content - Content of the newsletter.
 * @param body.organizationIds - An array of organization IDs to which the newsletter will be sent.
 * @param body.roles - An array specifying the roles  (`admin`, `member`) who will receive the newsletter.
 * @param body.subject - Subject of the newsletter.
 * @param toSelf - A flag to determine if the newsletter should be sent to the sender only.
 * @returns A boolean indicating whether the newsletter was successfully sent.
 */
export const sendNewsletter = async ({ body, toSelf = false }: { body: NewsLetterBody; toSelf: boolean }) => {
  const response = await client.newsletter.$post({
    json: body,
    query: { toSelf },
  });

  const json = await handleResponse(response);
  return json.success;
};
