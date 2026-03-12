export const truncateMiddle = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text;
  const edgeLen = Math.floor((maxLength - 1) / 2);
  return `${text.slice(0, edgeLen)}…${text.slice(-edgeLen)}`;
};
