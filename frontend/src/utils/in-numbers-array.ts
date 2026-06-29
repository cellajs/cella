/**
 * Check if a string number is included in an array of numbers from 1 to arrayLen.
 * Used for validating query params that are expected to be numeric and within a certain range.
 */
export const inNumbersArray = (arrayLen: number, number: string) => {
  const array = [...Array(arrayLen).keys()].map((i) => i + 1);

  return array.includes(Number.parseInt(number, 10));
};
