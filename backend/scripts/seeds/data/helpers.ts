export const extractKeywords = (description: string) => {
  const words = description
    .split(/\s+/) // Split by any whitespace
    .map((word) => word.toLowerCase()) // Convert to lowercase
    .map((word) => word.replace(/[^a-z0-9]/g, '')) // Remove non-alphanumeric chars
    .filter((word) => word.length > 0); // Filter out empty strings

  const uniqueWords = [...new Set(words)];

  return uniqueWords.join(' ');
};
