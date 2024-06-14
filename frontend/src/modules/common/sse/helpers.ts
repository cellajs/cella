export const removeIdFromSubMenu = (submenu: Record<string, string[]>, idToRemove: string) => {
  const newSubmenu = { ...submenu };
  for (const key in newSubmenu) {
    if (Object.hasOwnProperty.call(newSubmenu, key)) {
      // If the key matches the idToRemove, delete the key-value pair
      if (key === idToRemove) {
        delete newSubmenu[key];
      } else {
        // If the values include the idToRemove, filter it out
        newSubmenu[key] = newSubmenu[key].filter((id) => id !== idToRemove);
      }
    }
  }

  return newSubmenu;
};
