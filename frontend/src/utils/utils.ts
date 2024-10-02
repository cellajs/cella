import { redirect } from '@tanstack/react-router';
import { type ClassValue, clsx } from 'clsx';
import { config } from 'config';
import dayjs from 'dayjs';
import calendar from 'dayjs/plugin/calendar';
import duration from 'dayjs/plugin/duration';
import isBetween from 'dayjs/plugin/isBetween';
import relativeTime from 'dayjs/plugin/relativeTime';
import i18next from 'i18next';
import { customAlphabet } from 'nanoid';
import * as React from 'react';
import { twMerge } from 'tailwind-merge';
import locale from '~/../../locales';
import { useNavigationStore } from '~/store/navigation';
import type { UserMenu, UserMenuItem } from '~/types/common';

dayjs.extend(isBetween);
dayjs.extend(calendar);
dayjs.extend(duration);
dayjs.extend(relativeTime);

const second = 1e3;
const minute = 6e4;
const hour = 36e5;
const day = 864e5;
// const week = 6048e5;
// const month = 2592e6;
const year = 31536e6;

// convert date in Twitter format
export const dateTwitterFormat = (startDate: string, passedLoc: keyof typeof locale, addStr?: string) => {
  const start = dayjs(startDate);
  const end = dayjs();
  const diff = Math.abs(end.diff(start));

  const loc = locale[passedLoc];
  let unit: keyof typeof loc;
  let num: number | string;

  if (diff <= second) {
    unit = 'now';
    num = ''; // No number needed for "now"
  } else if (diff < minute) {
    unit = 'seconds';
    num = Math.floor(diff / second);
  } else if (diff < hour) {
    unit = 'minutes';
    num = Math.floor(diff / minute);
  } else if (diff < day) {
    unit = 'hours';
    num = Math.floor(diff / hour);
  } else if (diff < year) {
    return start.format('MMM D');
  } else {
    return start.format('MMM D, YYYY');
  }

  if (unit === 'now') return loc[unit];
  const result = loc[unit].replace('%d', num.toString());
  return addStr ? `${result} ${addStr}` : result;
};

// Format a date to a relative time
export function dateShort(date?: string | null | Date) {
  if (!date) return '-';

  return dayjs(date).calendar(null, {
    sameDay: '[Today], H:mm',
    lastDay: '[Yesterday], H:mm',
    lastWeek: 'dddd, H:mm',
    sameElse: (now: dayjs.Dayjs) => {
      const monthDiff = now.diff(dayjs(date), 'month');
      if (monthDiff <= 3) return dayjs(date).format('MMM D, H:mm');
      return dayjs(date).format('MMM D, YYYY');
    },
  });
}

// nanoid with only lowercase letters and numbers
export const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789');

// Merge tailwind classes
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Get a color class based on an id
export const getColorClass = (id?: string) => {
  if (!id) return 'bg-gray-300';
  const index = generateNumber(id) || 0;
  return config.placeholderColors[index];
};

// Generate a number from a string (ie. to choose a color)
export function generateNumber(id: string) {
  if (!id) return null;

  for (let i = id.length - 1; i >= 0; i--) {
    const char = id[i].toLowerCase();
    if (Number.parseInt(char) >= 0 && Number.parseInt(char) <= 9) {
      return Number.parseInt(char) % 10;
    }
    if (char >= 'a' && char <= 'z') {
      return (char.charCodeAt(0) - 'a'.charCodeAt(0)) % 10;
    }
  }
  return null;
}

// Get valid children from a React component
export function getValidChildren(children: React.ReactNode) {
  return React.Children.toArray(children).filter((child) => React.isValidElement(child));
}

// Clean a URL by removing search and hash
export function cleanUrl(url?: string | null) {
  if (!url) return null;

  const newUrl = new URL(url);
  newUrl.search = '';
  newUrl.hash = '';
  return newUrl.toString();
}

// If key and value are equal, then translation does not exist
export const translationExists = (key: string) => {
  return i18next.t(key) !== key;
};

// Prevent direct access to a parent route, always redirect to a child
export const noDirectAccess = (pathname: string, param: string, redirectLocation: string) => {
  if (!pathname.endsWith(param)) return;
  throw redirect({ to: pathname + redirectLocation, replace: true });
};

// Adding new item on local store user's menu
export const addMenuItem = (newEntity: UserMenuItem, storage: keyof UserMenu) => {
  const menu = useNavigationStore.getState().menu;

  // TODO: Do we still need parentId?
  const add = (items: UserMenuItem[]): UserMenuItem[] => {
    return items.map((item) => {
      if (item.id === newEntity.parentId) {
        return {
          ...item,
          submenu: item.submenu ? [...item.submenu, newEntity] : [newEntity],
        };
      }
      return item;
    });
  };

  const updatedStorage = newEntity.parentId ? add(menu[storage]) : [...menu[storage], newEntity];

  return {
    ...menu,
    [storage]: updatedStorage,
  };
};

// Check if the passed date is between passed number of days and today(inclusive)
export const recentlyUsed = (date: string | null, days: number) => {
  if (!date) return false;
  const convertedDate = new Date(date);
  // Calculate the date days ago and today using dayjs
  const daysAgo = dayjs().subtract(days, 'day');
  const today = dayjs();
  return dayjs(convertedDate).isBetween(daysAgo, today, null, '[]');
};
