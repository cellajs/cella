/**
 * Determines if an attachment is locally stored (offline) based on its originalKey
 * Local attachments have blob URLs starting with 'blob:http'
 */
export const isLocalAttachment = (key: string): boolean => key.startsWith('blob:http') ?? false;
// TODO remove it after offline first attachment
