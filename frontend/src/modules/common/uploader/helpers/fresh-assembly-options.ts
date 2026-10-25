// biome-ignore lint/style/noRestrictedImports: runtime token fetch inside an Uppy assembly callback, not eligible for a React Query hook.
import { getUploadToken } from 'sdk';
import type { UploadTokenQuery } from '~/modules/me/types';

/** Signed params for one assembly, asked when it starts: they expire within minutes. */
export const freshAssemblyOptions = async (tokenQuery: UploadTokenQuery) => {
  const token = await getUploadToken({ query: tokenQuery });
  if (!token?.params || !token?.signature) throw new Error('Failed to get upload token');
  return { params: token.params, signature: token.signature };
};
