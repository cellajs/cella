import { type Entity, type PageEntity, config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import type { UploadParams } from '~/lib/imado/types';
import { generalHc } from '#/modules/general/hc';

export const client = generalHc(config.backendUrl, clientConfig);

/**
 * Get upload token to securely upload files with imado
 *
 * @link https://imado.eu
 */
export const getUploadToken = async (type: 'organization' | 'personal', query: UploadParams = { public: false, organizationId: undefined }) => {
  const id = query.organizationId;

  if (!id && type === 'organization') return console.error('Organization id required for organization uploads');

  if (id && type === 'personal') return console.error('Personal uploads should be typed as personal');

  const preparedQuery = {
    public: String(query.public),
    organization: id,
  };

  const response = await client['upload-token'].$get({ query: preparedQuery });

  const json = await handleResponse(response);
  return json.data;
};

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

/**
 * Check if a slug is available for a given entity type.
 *
 * @param params - Parameters to check slug availability.
 * @param params.slug - Slug to check.
 * @param params.type - Entity type for which the slug is being checked.
 * @returns A boolean indicating whether the slug is available.
 */
export const checkSlugAvailable = async (params: { slug: string; type: Entity }) => {
  const response = await client['check-slug'].$post({
    json: params,
  });

  const json = await handleResponse(response);
  return json.success;
};

/**
 * Get suggestions for a given query and optional entity type.
 *
 * @param query - Search query.
 * @param type - Optional, type of entity to filter suggestions by.
 * @returns An array of suggested entities based on the query.
 */
export const getSuggestions = async (query: string, type?: PageEntity | undefined) => {
  const response = await client.suggestions.$get({
    query: { q: query, type },
  });

  const json = await handleResponse(response);
  return json.data;
};
