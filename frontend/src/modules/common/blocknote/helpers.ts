export const triggerFocus = (id: string) => {
  const editorContainerElement = document.getElementById(id);
  const editorElement = editorContainerElement?.getElementsByClassName('bn-editor')[0] as HTMLDivElement | undefined;
  editorElement?.focus();
};
