const units: [size: number, suffix: string][] = [
  [1e6, 'M'],
  [1e3, 'k'],
];

/** Compact count, rounded down: 950, 1.5k, 21k, 1.2M. */
export const formatCount = (count: number): string => {
  const unit = units.find(([size]) => count >= size);
  if (!unit) return String(count);

  const [size, suffix] = unit;
  const step = count < size * 10 ? size / 10 : size;

  return `${(Math.floor(count / step) * step) / size}${suffix}`;
};
