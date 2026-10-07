/** Up to two initials of a name: the first letter or digit of its first and of its last word. A single word gives one, no name gives none. */
export const getInitials = (name?: string | null) => {
  const letters = (name ?? '')
    .normalize('NFC')
    .split(/\s+/)
    .flatMap((word) => word.match(/[\p{L}\p{N}]/u)?.[0] ?? []);

  const initials = letters.length > 1 ? [...letters.slice(0, 1), ...letters.slice(-1)] : letters;
  return initials.map((letter) => letter.toUpperCase());
};
