import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/dist/types/types';
import { redirect } from '@tanstack/react-router';
import type { EntityType } from 'backend/types/common';
import { type ClassValue, clsx } from 'clsx';
import dayjs from 'dayjs';
import calendar from 'dayjs/plugin/calendar';
import relativeTime from 'dayjs/plugin/relativeTime';
import i18next from 'i18next';
import { customAlphabet } from 'nanoid';
import * as React from 'react';
import { flushSync } from 'react-dom';
import { twMerge } from 'tailwind-merge';
import type { Task } from '~/modules/common/electric/electrify';
import type { DraggableItemData } from '~/types';

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

// To sort Tasks by its status & order
export const sortTaskOrder = (task1: Pick<Task, 'status' | 'sort_order'>, task2: Pick<Task, 'status' | 'sort_order'>) => {
  if (task1.status !== task2.status) return task2.status - task1.status;
  // same status, sort by sort_order
  if (task1.sort_order !== null && task2.sort_order !== null) return task1.sort_order - task2.sort_order;
  // sort_order is null
  return 0;
};

export const arrayMove = (array: string[], startIndex: number, endIndex: number) => {
  const newArray = [...array];
  const [removedElement] = newArray.splice(startIndex, 1);
  newArray.splice(endIndex, 0, removedElement);
  return newArray;
};

export const getDraggableItemData = <T>(
  item: T,
  itemIndex: number,
  type: 'task' | 'column' | 'menuItem',
  itemType?: EntityType,
): DraggableItemData<T> => {
  return { dragItem: true, item, index: itemIndex, type, itemType: itemType || 'ORGANIZATION' };
};

// To get target index for drop on DnD
export const getReorderDestinationIndex = (
  currentIndex: number,
  closestEdgeOfTarget: Edge | null,
  targetIndex: number,
  axis: 'vertical' | 'horizontal',
): number => {
  if (targetIndex === currentIndex) return currentIndex;
  if (axis === 'horizontal') {
    if (
      (targetIndex === currentIndex - 1 && closestEdgeOfTarget === 'right') ||
      (targetIndex === currentIndex + 1 && closestEdgeOfTarget === 'left')
    ) {
      return currentIndex;
    }
    if ((targetIndex === 0 && closestEdgeOfTarget === 'right') || (currentIndex > targetIndex && closestEdgeOfTarget === 'right')) {
      return targetIndex + 1;
    }
    if (currentIndex < targetIndex && closestEdgeOfTarget === 'left') return targetIndex - 1;

    return targetIndex;
  }

  if (axis === 'vertical') {
    if (
      (targetIndex === currentIndex - 1 && closestEdgeOfTarget === 'bottom') ||
      (targetIndex === currentIndex + 1 && closestEdgeOfTarget === 'top')
    ) {
      return currentIndex;
    }

    if ((targetIndex === 0 && closestEdgeOfTarget === 'bottom') || (currentIndex > targetIndex && closestEdgeOfTarget === 'bottom')) {
      return targetIndex + 1;
    }
    if (currentIndex < targetIndex && closestEdgeOfTarget === 'top') return targetIndex - 1;

    return targetIndex;
  }

  return currentIndex;
};

export const sortById = (a: string, b: string, order: string[]) => {
  const indexA = order.indexOf(a);
  const indexB = order.indexOf(b);
  if (indexA === -1 || indexB === -1) return indexA === -1 ? 1 : -1;
  return indexA - indexB;
};
