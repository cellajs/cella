/** The region's name in `language`, or its code where the browser has no name for it. */
export const regionName = (code: string, language: string) => {
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};
