/** The URL's search as strings: `?q=123` reads as text and a list key as its comma-separated values. */
export const parseSearch = (searchStr: string): Record<string, string> => Object.fromEntries(new URLSearchParams(searchStr));

// A comma or a colon is a valid query character, and a list reads better with its commas kept
const encodeValue = (value: string) => encodeURIComponent(value).replace(/%2C/g, ',').replace(/%3A/g, ':');

/** Every value as a string and a list joined by commas; an absent, null or empty value is left out of the URL. */
export const stringifySearch = (search: Record<string, unknown>): string => {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(search)) {
    const text = Array.isArray(value) ? value.join(',') : value === undefined || value === null ? '' : String(value);
    if (text !== '') pairs.push(`${encodeURIComponent(key)}=${encodeValue(text)}`);
  }
  return pairs.length ? `?${pairs.join('&')}` : '';
};
