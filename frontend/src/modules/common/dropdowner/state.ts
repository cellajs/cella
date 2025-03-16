import type React from 'react';

export type DropdownT = {
  id: number | string;
  trigger?: HTMLElement;
  refocus?: boolean;
  autoFocus?: boolean;
  content?: React.ReactNode;
  align?: 'start' | 'end';
  modal?: boolean;
};

export type DropdownToRemove = {
  id: number | string;
  remove: true;
  refocus?: boolean;
};

export type ExternalDropdown = Omit<DropdownT, 'id' | 'content'> & {
  id?: number | string;
};

const isDropdown = (dropdowner: DropdownT | DropdownToRemove): dropdowner is DropdownT => {
  return !('remove' in dropdowner);
};

class Observer {
  subscribers: ((dropdowner: DropdownT | DropdownToRemove) => void)[];
  dropdowner: DropdownT | null;

  constructor() {
    this.subscribers = [];
    this.dropdowner = null;
  }

  subscribe = (subscriber: (dropdowner: DropdownT | DropdownToRemove) => void) => {
    this.subscribers.push(subscriber);
    if (this.dropdowner) subscriber(this.dropdowner);

    return () => {
      this.subscribers = this.subscribers.filter((sub) => sub !== subscriber);
    };
  };

  publish = (data: DropdownT | DropdownToRemove) => {
    this.dropdowner = isDropdown(data) ? data : null;
    for (const subscriber of this.subscribers) subscriber(data);
  };

  set = (data: DropdownT) => {
    this.publish(data);
  };

  remove = (refocus = true) => {
    if (this.dropdowner) this.publish({ ...this.dropdowner, remove: true, refocus });
  };

  get = (id: number | string) => {
    return this.dropdowner ? this.dropdowner.id === id : false;
  };

  updateOpenDropdown = (data: Partial<DropdownT>) => {
    if (!this.dropdowner) return;

    const updatedDropdown = { ...this.dropdowner, ...data };
    this.dropdowner = updatedDropdown;
    this.publish(updatedDropdown);
  };

  getOpenDropdown = () => {
    return this.dropdowner;
  };
}

export const dropdownerState = new Observer();

const dropdownerFunction = (content: React.ReactNode, data?: ExternalDropdown) => {
  const id = data?.id || 1;

  //if exist close
  const existingDropdown = dropdownerState.get(id);
  if (existingDropdown) {
    dropdownerState.remove();
    return null;
  }

  dropdownerState.set({
    content,
    refocus: true,
    modal: data?.modal ?? true,
    align: 'start',
    id,
    ...data,
  });
  return id;
};

export const dropdowner = Object.assign(dropdownerFunction, {
  remove: dropdownerState.remove,
  get: dropdownerState.get,
  getOpenDropdown: dropdownerState.getOpenDropdown,
  updateOpenDropdown: dropdownerState.updateOpenDropdown,
});
