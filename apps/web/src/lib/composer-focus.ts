/**
 * Focus the composer's contenteditable body and park the caret at the end.
 * The old textarea called `setSelectionRange`; a contenteditable caret is set
 * through a collapsed DOM range instead.
 */
export function focusComposerInput() {
  const el = document.getElementById("flaremo-composer-input");
  if (!(el instanceof HTMLElement) || !el.isContentEditable) return;
  el.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}
