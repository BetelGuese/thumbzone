import type { ThumbzoneElements } from './adapter'

/**
 * Moves Emotion's server-rendered rules out of the pattern's own elements and
 * into `document.head`, matching Emotion's own client-side pass in every
 * particular that matters:
 *
 * - the same selector, queried against the document so the nodes are visited in
 *   document order and their order relative to each other survives the move;
 * - the same requirement of a space in `data-emotion`, which is what marks a
 *   rule as Emotion 11's server output rather than Emotion 10's client output;
 * - the same destination, `document.head`;
 * - the same `data-s` stamp on the way out, which is how Emotion records that a
 *   node has already been hoisted — without it, Emotion's own pass would move
 *   these nodes a second time and reorder them against anything hoisted since.
 *
 * Only nodes inside the pattern's own elements are touched. The rest of the
 * page's rules are Emotion's business, and moving them would be this module
 * reaching outside what it was handed.
 *
 * Shared because two ports style with Emotion 11 — Material UI and Chakra UI —
 * and both need this pass unchanged. Its effect is not covered by the
 * conformance suite: a mutation dropping the `beforeInit` call that runs this
 * left all five ports green, because the hoisted node has no rendered box and
 * is not focusable, so nothing in the suite notices its absence. That gap is
 * also recorded at `beforeInit`'s own JSDoc in `adapter.ts`; it is repeated
 * here because this is the file a porter reads when deciding whether their own
 * styling system needs the seam.
 */
export function hoistServerRenderedStyles({ sheet, scrim, trigger }: ThumbzoneElements): void {
  const roots = [sheet, scrim, trigger]
  for (const style of document.querySelectorAll('style[data-emotion]:not([data-s])')) {
    if (!roots.some((root) => root.contains(style))) continue
    if (!style.getAttribute('data-emotion')?.includes(' ')) continue
    document.head.append(style)
    style.setAttribute('data-s', '')
  }
}
