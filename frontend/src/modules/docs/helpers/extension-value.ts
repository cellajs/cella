import type { TFunction } from 'i18next';
import type { GenExtensionDefinition, GenRateLimitPolicy } from 'sdk/docs-types';
import type { AccessValue } from '~/modules/docs/operations/access-explanation';

const units = [
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
] as const;

/** Seconds in the largest unit that holds them whole: 300 reads "5 minutes", 86,400 "1 day". */
const spanText = (seconds: number, language: string | undefined) => {
  const [unit, size] = units.find(([, size]) => seconds % size === 0) ?? units[3];
  return new Intl.NumberFormat(language, { style: 'unit', unit, unitDisplay: 'long' }).format(seconds / size);
};

/** A limiter's budget as a sentence: "1,000 per 5 minutes." or "5 per 1 hour, then blocked for 30 minutes." */
const policyText = ({ points, duration, blockDuration }: GenRateLimitPolicy, t: TFunction, language: string | undefined) => {
  const values = { points: points.toLocaleString(language), window: spanText(duration, language) };
  if (blockDuration) return t('c:docs.rate_budget_blocked', { ...values, block: spanText(blockDuration, language) });
  return t('c:docs.rate_budget', values);
};

/** An extension value as the table and the access panel show it: its label, and for a limiter its budget before its text. */
export const extensionValue = (ext: GenExtensionDefinition, value: string, t: TFunction, language: string | undefined): AccessValue => {
  const meta = ext.values?.[value];
  const description = [meta?.policy && policyText(meta.policy, t, language), meta?.description].filter(Boolean).join(' ');
  return { value, code: value, name: meta?.name ?? value, description: description || undefined, isGuard: ext.key === 'x-guard' };
};
