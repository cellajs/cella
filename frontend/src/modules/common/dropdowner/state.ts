import type React from 'react';

export type DropDownT = {
  id: number | string;
  trigger?: HTMLElement;
  refocus?: boolean;
  autoFocus?: boolean;
  content?: React.ReactNode;
  align?: 'start' | 'end';
};

export type DropDownToRemove = {
  id: number | string;
  remove: true;
  refocus?: boolean;
};

export type ExternalDropDown = Omit<DropDownT, 'id' | 'content'> & {
  id?: number | string;
};

const isDropDown = (dropdowner: DropDownT | DropDownToRemove): dropdowner is DropDownT => {
  return !(dropdowner as DropDownToRemove).remove;
};

class Observer {
  subscribers: ((dropdowner: DropDownT | DropDownToRemove) => void)[];
  dropdowner: DropDownT | null;

  constructor() {
    this.subscribers = [];
    this.dropdowner = null;
  }

  subscribe = (subscriber: (dropdowner: DropDownT | DropDownToRemove) => void) => {
    this.subscribers.push(subscriber);
    if (this.dropdowner) subscriber(this.dropdowner);

    return () => {
      this.subscribers = this.subscribers.filter((sub) => sub !== subscriber);
    };
  };

  publish = (data: DropDownT | DropDownToRemove) => {
    this.dropdowner = isDropDown(data) ? data : null;
    for (const subscriber of this.subscribers) subscriber(data);
  };

  set = (data: DropDownT) => {
    this.publish(data);
  };

  remove = (refocus = true) => {
    if (this.dropdowner) this.publish({ ...this.dropdowner, remove: true, refocus });
  };

  get = (id: number | string) => {
    return this.dropdowner ? this.dropdowner.id === id : false;
  };
}

export const dropdownerState = new Observer();

const dropdownerFunction = (content: React.ReactNode, data?: ExternalDropDown) => {
  const id = data?.id || 1;

  //if exist close
  const existingDropDown = dropdownerState.get(id);
  if (existingDropDown) {
    dropdownerState.remove();
    return null;
  }

  dropdownerState.set({
    content,
    refocus: true,
    autoFocus: true,
    align: 'start',
    id,
    ...data,
  });
  return id;
};

export const dropdowner = Object.assign(dropdownerFunction, {
  remove: dropdownerState.remove,
  get: dropdownerState.get,
});
