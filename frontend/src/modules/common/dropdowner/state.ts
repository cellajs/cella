import type React from 'react';

let dropDownsCounter = 1;

export type DropDownT = {
  id: number | string;
  drawerOnMobile?: boolean;
  container?: HTMLElement | null;
  className?: string;
  refocus?: boolean;
  autoFocus?: boolean;
  hideClose?: boolean;
  content?: React.ReactNode;
  trigger?: React.ReactNode;
};

export type DropDownToRemove = {
  id: number | string;
  remove: true;
  refocus?: boolean;
};

export type ExternalDropDown = Omit<DropDownT, 'id' | 'content'> & {
  id?: number | string;
};

export const isDropDown = (dropDown: DropDownT | DropDownToRemove): dropDown is DropDownT => {
  return !(dropDown as DropDownToRemove).remove;
};

class Observer {
  subscribers: Array<(dropDown: DropDownT | DropDownToRemove) => void>;
  dropDowns: (DropDownT | DropDownToRemove)[];

  constructor() {
    this.subscribers = [];
    this.dropDowns = [];
  }

  subscribe = (subscriber: (dropDown: DropDownT | DropDownToRemove) => void) => {
    this.subscribers.push(subscriber);

    return () => {
      const index = this.subscribers.indexOf(subscriber);
      this.subscribers.splice(index, 1);
    };
  };

  publish = (data: DropDownT) => {
    for (const subscriber of this.subscribers) {
      subscriber(data);
    }
  };

  set = (data: DropDownT) => {
    this.publish(data);
    this.dropDowns = [...this.dropDowns, data];
  };

  get = (id: number | string) => {
    return this.dropDowns.find((dropDown) => dropDown.id === id);
  };

  remove = (refocus = true, id?: number | string) => {
    if (id) {
      for (const subscriber of this.subscribers) {
        subscriber({ id, remove: true, refocus });
      }

      return;
    }

    // Remove all dropDowns
    for (const dropDown of this.dropDowns) {
      for (const subscriber of this.subscribers) {
        subscriber({ id: dropDown.id, remove: true, refocus });
      }
    }
  };
}

export const dropDownState = new Observer();

const dropDownFunction = (content: React.ReactNode, trigger: React.ReactNode, data?: ExternalDropDown) => {
  const id = data?.id || dropDownsCounter++;

  dropDownState.set({
    trigger,
    content,
    drawerOnMobile: true,
    refocus: true,
    autoFocus: true,
    hideClose: false,
    ...data,
    id,
  });
  return id;
};

export const dropDown = Object.assign(dropDownFunction, {
  remove: dropDownState.remove,
  get: dropDownState.get,
});
