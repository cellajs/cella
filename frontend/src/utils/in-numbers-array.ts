/** Whether `number` parses to an integer in the range 1 to `arrayLen`. */
export const inNumbersArray = (arrayLen: number, number: string) => {
  const array = [...Array(arrayLen).keys()].map((i) => i + 1);

  return array.includes(Number.parseInt(number, 10));
};
