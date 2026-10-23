/** Whether `value` parses to an integer in the range 1 to `length`. */
export const isInRange = (length: number, value: string) => {
  const parsed = Number.parseInt(value, 10);
  return parsed >= 1 && parsed <= length;
};
