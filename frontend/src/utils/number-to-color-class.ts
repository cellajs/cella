import { appConfig } from 'shared';

function toColorIndex(id: string) {
  for (let i = id.length - 1; i >= 0; i--) {
    const char = id[i].toLowerCase();
    if (char >= '0' && char <= '9') return Number(char);
    if (char >= 'a' && char <= 'z') return (char.charCodeAt(0) - 'a'.charCodeAt(0)) % 10;
  }
  return null;
}

/** Deterministic placeholder color class for an id; gray when the id is empty or has no alphanumeric character. */
export const numberToColorClass = (id?: string) => {
  if (!id) return 'bg-gray-300';
  return appConfig.placeholderColors[toColorIndex(id) ?? 0];
};
