import { appConfig } from 'config';

/**
 * Generates a number from a string for color selection.
 */
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

/**
 * Returns a color class based on a string identifier.
 */
export const numberToColorClass = (id?: string) => {
  if (!id) return 'bg-gray-300';
  const index = generateNumber(id) || 0;
  return appConfig.placeholderColors[index];
};
