import { type ClassValue, clsx } from 'clsx';
import dayjs from 'dayjs';
import calendar from 'dayjs/plugin/calendar';
import relativeTime from 'dayjs/plugin/relativeTime';
import { twMerge } from 'tailwind-merge';
import * as React from "react"

dayjs.extend(calendar);
dayjs.extend(relativeTime);

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateNumber(id: string) {
  for (let i = id.length - 1; i >= 0; i--) {
    const char = id[i].toLowerCase();
    if (parseInt(char) >= 0 && parseInt(char) <= 9) {
      return parseInt(char) % 10;
    }
    if (char >= 'a' && char <= 'z') {
      return (char.charCodeAt(0) - 'a'.charCodeAt(0)) % 10;
    }
  }
  return null;
}

export function dateShort(date?: string | null) {
  if (!date) return '-';

  return dayjs(date).calendar(null, {
    sameDay: '[Today]',
    lastDay: '[Yesterday]',
    lastWeek: '[Last] dddd',
    sameElse: 'DD/MM/YYYY',
  });
}

export function getValidChildren(children: React.ReactNode) {
  return React.Children.toArray(children).filter((child) =>
    React.isValidElement(child)
  ) as React.ReactElement[]
}

// export function getObjectWithArrayForEachKey<T>(keys: string[]): Record<string, T[]> {
//   return keys.reduce((acc, key) => {
//     acc[key] = [];
//     return acc;
//   }, {} as Record<string, T[]>);
// }
