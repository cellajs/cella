import { appConfig } from 'shared';

function generateNumber(id: string) {
  if (!id) return null;

  for (let i = id.length - 1; i >= 0; i--) {
    const char = id[i].toLowerCase();
    if (Number.parseInt(char, 10) >= 0 && Number.parseInt(char, 10) <= 9) {
      return Number.parseInt(char, 10) % 10;
    }
    if (char >= 'a' && char <= 'z') {
      return (char.charCodeAt(0) - 'a'.charCodeAt(0)) % 10;
    }
  }
  return null;
}

/** Deterministic placeholder color class for an id; gray when the id is empty or has no alphanumeric character. */
export const numberToColorClass = (id?: string) => {
  if (!id) return 'bg-gray-300';
  const index = generateNumber(id) || 0;
  return appConfig.placeholderColors[index];
};
