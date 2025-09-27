export function sanitizeEmailSubject(value: string, max = 150): string {
  if (!value) return '';
  // Normalize unicode and remove CR/LF + control chars
  let s = value
    .normalize('NFC')
    .replace(/[\r\n]+/g, ' ') // no newlines in headers
    .replace(/[\u0000-\u001F\u007F]/g, ' ') // strip control chars
    .replace(/\s{2,}/g, ' ') // collapse whitespace
    .trim();

  if (s.length > max) s = s.slice(0, max - 1) + '…';
  return s;
}
