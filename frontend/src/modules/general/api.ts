import { type Entity, type PageEntity, config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import type { UploadParams } from '~/lib/imado';
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

// Invite users
export const invite = async (values: SystemInviteProps) => {
  const response = await client.invite.$post({
    json: values,
  });

  await handleResponse(response);
};

// Check if slug is available
export const checkSlugAvailable = async (params: { slug: string; type: Entity }) => {
  const response = await client['check-slug'].$post({
    json: params,
  });

  const json = await handleResponse(response);
  return json.success;
};

// Get suggestions
export const getSuggestions = async (query: string, type?: PageEntity | undefined) => {
  const response = await client.suggestions.$get({
    query: { q: query, type },
  });

  const json = await handleResponse(response);
  return json.data;
};
