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
export const placeholderColorClass = (id?: string) => {
  if (!id) return 'bg-gray-300';
  return appConfig.placeholderColors[toColorIndex(id) ?? 0];
};

/** Placeholder color for a cover or banner without an image, darker in dark mode; avatars keep the plain color. */
export const placeholderCoverClass = (id?: string) => `${placeholderColorClass(id)} dark:bg-linear-to-b dark:from-black/40 dark:to-black/40`;
