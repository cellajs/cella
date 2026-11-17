const units = ['B', 'KB', 'MB', 'GB', 'TB'];

/** Human-readable file size from a byte count. */
export const formatBytes = (bytes: number): string => {
  if (bytes <= 0 || Number.isNaN(bytes)) return '0 B';

  const index = Math.floor(Math.log(bytes) / Math.log(1024));

  // Number() drops trailing zeros: 50 MB, 1.5 GB
  const formattedSize = Number((bytes / 1024 ** index).toFixed(index > 1 ? 2 : 0));

  return `${formattedSize} ${units[index]}`;
};
