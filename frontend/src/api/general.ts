import { UploadParams, UploadType } from '~/types';
import { ApiError, client } from '.';

// Get upload token to securely upload files with imado: https://imado.eu
export const getUploadToken = async (type: UploadType, query: UploadParams = { public: false, organizationId: undefined }) => {
  const id = query.organizationId;

  if (!id && type === UploadType.Organization) {
    throw new ApiError(400, 'Organization id required for organization uploads');
  }

  if (id && type === UploadType.Personal) {
    throw new ApiError(400, 'Personal uploads should be typed as personal');
  }

  const preparedQuery = {
    public: String(query.public),
    organizationId: id,
  };

  const response =
    type === UploadType.Organization && id
      ? await client['upload-token'].$get({
          query: preparedQuery,
        })
      : await client['upload-token'].$get({ query: preparedQuery });

  const json = await response.json();
  if ('error' in json) throw new ApiError(response.status, json.error);
  return json.data;
};

// Get public counts for about page
export const getPublicCounts = async () => {
  const response = await client.public.counts.$get();

  const json = await response.json();
  if ('error' in json) throw new ApiError(response.status, json.error);
  return json.data;
};
