/**
 * Cleans a URL by removing the search query and hash fragments.
 *
 * @param url - The URL to be cleaned.
 * @returns The cleaned URL, or null if the input is invalid.
 */
export const cleanUrl = (url?: string | null) => {
  if (!url) return null;

  const newUrl = new URL(url);
  newUrl.search = '';
  newUrl.hash = '';
  return newUrl.toString();
};
