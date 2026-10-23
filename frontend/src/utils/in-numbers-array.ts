/** Whether `value` parses to an integer in the range 1 to `length`. */
export const inNumbersArray = (length: number, value: string) => {
  const array = [...Array(length).keys()].map((i) => i + 1);

  return array.includes(Number.parseInt(value, 10));
};
