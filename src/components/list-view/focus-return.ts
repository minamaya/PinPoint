/**
 * Focus handed back to a control by something it opened: a menu, sheet,
 * dialog, or editor closing. Whatever hands the focus back marks it here,
 * immediately before the focus moves; NameTooltip then skips the tooltip
 * for that one focus, which Radix would otherwise open (design-bible
 * §26.2). Arriving by Tab or hovering is never marked, so it still shows
 * the tooltip.
 *
 * A mark lives only until the current task's microtasks run: focus moves
 * synchronously, so a mark the focus did not take (Radix chose not to
 * refocus, or the element already had focus) is gone before any later
 * arrival could meet it.
 */

const marks = new WeakSet<Element>();

/**
 * Marks the focus `element` is about to get as a return. Call it right
 * before the focus moves, such as in a menu's `onCloseAutoFocus` when
 * Radix refocuses the trigger next. An element that already has focus gets
 * no focus event, so it is not marked.
 */
export function markFocusReturn(element: Element | null | undefined): void {
  if (!element || element === document.activeElement) return;
  marks.add(element);
  queueMicrotask(() => marks.delete(element));
}

/** Hands focus back to `element`, marked as a return. */
export function returnFocusTo(
  element: HTMLElement | null | undefined,
  options?: FocusOptions
): void {
  if (!element) return;
  markFocusReturn(element);
  element.focus(options);
}

/** Whether this focus of `element` is a marked return; takes the mark. */
export function takeFocusReturn(element: Element): boolean {
  return marks.delete(element);
}
