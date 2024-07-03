import type React from 'react';

export type DropDownT = {
  id: number | string;
  trigger?: HTMLElement;
  refocus?: boolean;
  autoFocus?: boolean;
  content?: React.ReactNode;
};

export type DropDownToRemove = {
  id: number | string;
  remove: true;
  refocus?: boolean;
};

export type ExternalDropDown = Omit<DropDownT, 'id' | 'content'> & {
  id?: number | string;
};

export const isDropDown = (dropdowner: DropDownT | DropDownToRemove): dropdowner is DropDownT => {
  return !(dropdowner as DropDownToRemove).remove;
};

class Observer {
  subscriber: ((dropdowner: DropDownT | DropDownToRemove) => void) | null;
  dropdowner: DropDownT | null;

  constructor() {
    this.subscriber = null;
    this.dropdowner = null;
  }

  subscribe = (subscriber: (dropdowner: DropDownT | DropDownToRemove) => void) => {
    this.subscriber = subscriber;
    if (this.dropdowner) {
      this.subscriber(this.dropdowner);
    }
    return () => {
      this.subscriber = null;
    };
  };

  publish = (data: DropDownT | DropDownToRemove) => {
    this.dropdowner = isDropDown(data) ? data : null;
    if (this.subscriber) {
      this.subscriber(data);
    }
  };

  set = (data: DropDownT) => {
    this.publish(data);
  };

  get = (id: number | string) => {
    return this.dropdowner?.id === id;
  };

  remove = (refocus = true) => {
    if (this.dropdowner) this.publish({ ...this.dropdowner, remove: true, refocus });
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
    id,
    ...data,
  });
  return id;
};

export const dropdowner = Object.assign(dropdownerFunction, {
  remove: dropdownerState.remove,
  get: dropdownerState.get,
});
