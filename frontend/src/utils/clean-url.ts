/** Returns `url` stripped of its query string and hash; null if `url` is empty. */
export const cleanUrl = (url?: string | null) => {
  if (!url) return null;

  const newUrl = new URL(url);
  newUrl.search = '';
  newUrl.hash = '';
  return newUrl.toString();
};
