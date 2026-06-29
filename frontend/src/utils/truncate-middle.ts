/**
 * Truncates a string in the middle if it exceeds the specified maximum length.
 * The truncated string will have an ellipsis ("…") in the middle to indicate that it has been shortened.
 *
 * @param text - The string to be truncated.
 * @param maxLength - The maximum allowed length of the string including the ellipsis.
 * @returns The truncated string if it exceeds the maximum length, otherwise returns the original string.
 */
export const truncateMiddle = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text;
  const edgeLen = Math.floor((maxLength - 1) / 2);
  return `${text.slice(0, edgeLen)}…${text.slice(-edgeLen)}`;
};
