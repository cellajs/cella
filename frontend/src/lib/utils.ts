import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/dist/types/types';
import { redirect } from '@tanstack/react-router';
import type { Entity } from 'backend/types/common';
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
import type { DraggableItemData, NewDraggableItemData, UserMenuItem } from '~/types';
import type { UserMenu } from '~/types';

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

export const getDraggableItemData = <T>(
  item: T,
  itemIndex: number | null,
  type: 'task' | 'column' | 'menuItem',
  itemType?: Entity,
): DraggableItemData<T> => {
  return { dragItem: true, item, index: itemIndex ? itemIndex : 0, type, itemType: itemType || 'ORGANIZATION' };
};

export const getNewDraggableItemData = <T>(
  item: T,
  itemOrder: number,
  type: 'task' | 'column' | 'menuItem',
  itemType: Entity,
): NewDraggableItemData<T> => {
  return { dragItem: true, item, order: itemOrder, type, itemType: itemType };
};

// To get target index for drop on DnD
export const getReorderDestinationOrder = (
  targetOrder: number,
  closestEdgeOfTarget: Edge | null,
  axis: 'vertical' | 'horizontal',
  sourceOrder?: number,
): number => {
  if (!closestEdgeOfTarget && sourceOrder) {
    if (sourceOrder > targetOrder) return targetOrder - 0.01;
    if (sourceOrder < targetOrder) return targetOrder + 0.01;
  }
  if (axis === 'horizontal') {
    if (closestEdgeOfTarget === 'left') return targetOrder - 0.01;
    if (closestEdgeOfTarget === 'right') return targetOrder + 0.01;
  }
  if (axis === 'vertical') {
    if (closestEdgeOfTarget === 'top') return targetOrder - 0.01;
    if (closestEdgeOfTarget === 'bottom') return targetOrder + 0.01;
  }

  return targetOrder;
};

export const findMembershipOrderById = (data: UserMenu, id: string) => {
  const search = (items: UserMenuItem[]): number => {
    const filtered = items.filter((i) => !i.membership.archived);
    for (const item of filtered) {
      if (item.id === id) return item.membership.order;
      if (item.submenu) {
        const found = search(item.submenu);
        if (found) return found;
      }
    }
    return 0;
  };

  return Object.values(data).reduce<number>((result, entities) => result || search(entities), 0);
};
