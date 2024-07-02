import type React from 'react';

export type DropDownT = {
  id: number | string;
  position: { top: number; left: number };
  trigger?: HTMLElement;
  drawerOnMobile?: boolean;
  refocus?: boolean;
  autoFocus?: boolean;
  hideClose?: boolean;
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

export const isDropDown = (dropDown: DropDownT | DropDownToRemove): dropDown is DropDownT => {
  return !(dropDown as DropDownToRemove).remove;
};

class Observer {
  subscriber: ((dropDown: DropDownT | DropDownToRemove) => void) | null;
  dropDown: DropDownT | null;

  constructor() {
    this.subscriber = null;
    this.dropDown = null;
  }

  subscribe = (subscriber: (dropDown: DropDownT | DropDownToRemove) => void) => {
    this.subscriber = subscriber;
    if (this.dropDown) {
      this.subscriber(this.dropDown);
    }
    return () => {
      this.subscriber = null;
    };
  };

  publish = (data: DropDownT | DropDownToRemove) => {
    this.dropDown = isDropDown(data) ? data : null;
    if (this.subscriber) {
      this.subscriber(data);
    }
  };

  set = (data: DropDownT) => {
    this.publish(data);
  };

  get = (id: number | string) => {
    return this.dropDown?.id === id;
  };

  remove = (refocus = true) => {
    if (this.dropDown) this.publish({ ...this.dropDown, remove: true, refocus });
  };
}

export const dropDownState = new Observer();

const dropDownFunction = (content: React.ReactNode, data?: ExternalDropDown) => {
  const id = data?.id || 1;

  //if exist close
  const existingDropDown = dropDownState.get(id);
  if (existingDropDown) {
    dropDownState.remove();
    return null;
  }

  const position = data?.position || { top: 0, left: 0 };
  dropDownState.set({
    content,
    drawerOnMobile: true,
    refocus: true,
    autoFocus: true,
    hideClose: false,
    position,
    id,

    ...data,
  });
  return id;
};

export const dropDown = Object.assign(dropDownFunction, {
  remove: dropDownState.remove,
  get: dropDownState.get,
});
