/**
 * Focus handed back to a control by something it opened: a menu, sheet,
 * dialog, or editor closing. Whatever hands the focus back marks it here;
 * NameTooltip then skips the tooltip for that one focus, which Radix would
 * otherwise open (design-bible §26.2). Arriving by Tab or hovering is never
 * marked, so it still shows the tooltip.
 */

/** A mark not taken within this long is stale: the focus never came. */
const MARK_LIFETIME_MS = 1_000;

const marks = new WeakMap<Element, number>();

/** Marks the next focus of `element` as a return, for a focus Radix moves. */
export function markFocusReturn(element: Element | null | undefined): void {
  if (element) marks.set(element, Date.now());
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
  const markedAt = marks.get(element);
  if (markedAt === undefined) return false;
  marks.delete(element);
  return Date.now() - markedAt <= MARK_LIFETIME_MS;
}
