export const triggerFocus = (id: string) => {
  const editorContainerElement = document.getElementById(id);
  const editorElement = editorContainerElement?.getElementsByClassName('bn-editor');
  if (editorElement?.length) (editorElement[0] as HTMLDivElement).focus();
};
