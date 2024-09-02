import { redirect } from '@tanstack/react-router';
import { type ClassValue, clsx } from 'clsx';
import dayjs from 'dayjs';
import calendar from 'dayjs/plugin/calendar';
import isBetween from 'dayjs/plugin/isBetween';
import relativeTime from 'dayjs/plugin/relativeTime';
import i18next from 'i18next';
import { customAlphabet } from 'nanoid';
import * as React from 'react';
import { flushSync } from 'react-dom';
import { twMerge } from 'tailwind-merge';
import { useNavigationStore } from '~/store/navigation';
import type { UserMenuItem } from '~/types';

dayjs.extend(isBetween);
dayjs.extend(calendar);
dayjs.extend(relativeTime);

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

// Start a View Transition
export function makeTransition(transition: () => void) {
  // @ts-ignore
  if (document.startViewTransition) {
    // @ts-ignore
    document.startViewTransition(() => {
      flushSync(() => {
        transition();
      });
    });
  } else {
    transition();
  }
}

const colors = [
  'bg-blue-300',
  'bg-lime-300',
  'bg-orange-300',
  'bg-yellow-300',
  'bg-green-300',
  'bg-teal-300',
  'bg-indigo-300',
  'bg-purple-300',
  'bg-pink-300',
  'bg-red-300',
];

// Get a color class based on an id
export const getColorClass = (id?: string) => {
  if (!id) return 'bg-gray-300';

  const index = generateNumber(id) || 0;
  return colors[index];
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
  return React.Children.toArray(children).filter((child) => React.isValidElement(child)) as React.ReactElement[];
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

// adding new item on local store user's menu
export const addMenuItem = (newEntity: UserMenuItem, storage: 'organizations' | 'workspaces') => {
  const menu = useNavigationStore.getState().menu;

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

export const recentlyUsed = (date: string | null, days: number) => {
  if (!date) return false;
  const convertedDate = new Date(date);
  const daysAgo = dayjs().subtract(days, 'day');
  const today = dayjs();
  return dayjs(convertedDate).isBetween(daysAgo, today, null, '[]');
};

// Helper function to decode base64 URL to Uint8Array
export const base64UrlDecode = (base64urlStr: string) => {
  let base64String = base64urlStr.replace(/-/g, '+').replace(/_/g, '/');
  while (base64String.length % 4 !== 0) {
    base64String += '=';
  }
  const binaryString = atob(base64String);
  return Uint8Array.from(binaryString.split('').map((char) => char.charCodeAt(0))).buffer;
};

// Helper function to encode Uint8Array to base64 URL
const base64UrlEncode = (uint8Array: Uint8Array): string => {
  const binaryString = String.fromCharCode(...uint8Array);
  return btoa(binaryString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const arrayBufferToBase64Url = (buffer: ArrayBuffer) => {
  const uint8Array = new Uint8Array(buffer);
  return base64UrlEncode(uint8Array);
};
