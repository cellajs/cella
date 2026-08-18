export function sanitizeEmailSubject(value: string, max = 150): string {
  if (!value) return '';
  let s = value
    .normalize('NFC')
    .replace(/[\r\n]+/g, ' ') // no newlines in headers
    // biome-ignore lint/suspicious/noControlCharactersInRegex: explicit control-char strip is the purpose of this sanitizer.
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (s.length > max) s = `${s.slice(0, max - 1)}…`;
  return s;
}
