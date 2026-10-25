const units = ['B', 'KB', 'MB', 'GB', 'TB'];

/** Human-readable file size. Accepts a byte count as string (API shape) or number. */
export const formatBytes = (bytes: string | number): string => {
  const parsedBytes = Number(bytes);

  if (parsedBytes <= 0 || Number.isNaN(parsedBytes)) return '0 B';

  const index = Math.floor(Math.log(parsedBytes) / Math.log(1024));

  // Number() drops trailing zeros: 50 MB, 1.5 GB
  const formattedSize = Number((parsedBytes / 1024 ** index).toFixed(index > 1 ? 2 : 0));

  return `${formattedSize} ${units[index]}`;
};
