export const inNumbersArray = (arrayLen: number, number: string) => {
  const array = [...Array(arrayLen).keys()].map((i) => i + 1);

  return array.includes(Number.parseInt(number));
};
