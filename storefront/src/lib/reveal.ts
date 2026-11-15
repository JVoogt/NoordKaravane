/**
 * How far to scroll the page down so a box sits in the clear part of the screen: below `clearTop` (the bottom of a
 * sticky header, or 0) and above `clearBottom` (the top of a bottom banner such as the cookie notice, or the viewport
 * height). Returns 0 when the box is already in the clear. When the box does not fit, its top wins, so the start of
 * the message is never hidden. Pure: callers pass rects, the browser does the scrolling.
 */
export function revealDelta(box: { top: number; bottom: number }, clearTop: number, clearBottom: number, margin = 16): number {
  const top = clearTop + margin;
  const bottom = clearBottom - margin;
  if (box.top >= top && box.bottom <= bottom) return 0;
  if (box.bottom - box.top > bottom - top) return box.top - top;
  return box.top < top ? box.top - top : box.bottom - bottom;
}
