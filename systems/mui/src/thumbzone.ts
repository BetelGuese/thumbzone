/**
 * The Material UI port's adapter onto the shared behaviour.
 *
 * The lifecycle, the focus trap, the pointer machine, the thumb-first reorder
 * and the teardown are `core/behaviour.js`'s, and the wiring between this
 * port's markup and that behaviour — including the ownership registry that lets
 * a late mount adopt an instance already running — is
 * `shared/react/adapter.ts`. What is left here is the one thing that varies
 * between React ports: getting Emotion's server-rendered `<style>` elements out
 * of the pattern's markup before anything reads it.
 *
 * It imports no framework, deliberately — see `useThumbzone` for the React
 * binding that mounts it. Framework-*agnostic* it is not: it knows what
 * rendering MUI to a string leaves in the markup, which is the price of running
 * before the framework does.
 *
 * Material UI supplies none of the pattern's services here, and that is a
 * consequence of the markup rather than a gap in the library. The services a
 * porter reaches for — a focus trap, Escape-to-close, a backdrop, return-focus
 * — all belong to `Modal`, not to `Drawer`, and the contract rules the
 * `Modal`-backed temporary variant out (see `ThumbzoneMenu` for why). What is
 * left is a `Paper` rendered in place. MUI still owns everything it can: the
 * components, the theme, the motion tokens, and the `Fab` that is a real
 * `<button>` for the trigger to be.
 */

import { createReactThumbzoneAdapter, type ThumbzoneElements } from '../../../shared/react/adapter'

export type { ThumbzoneRefs, ThumbzoneHandle } from '../../../shared/react/adapter'

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
 */
function hoistServerRenderedStyles({ sheet, scrim, trigger }: ThumbzoneElements): void {
  const roots = [sheet, scrim, trigger]
  for (const style of document.querySelectorAll('style[data-emotion]:not([data-s])')) {
    if (!roots.some((root) => root.contains(style))) continue
    if (!style.getAttribute('data-emotion')?.includes(' ')) continue
    document.head.append(style)
    style.setAttribute('data-s', '')
  }
}

/** This port's adapter. Exported for `useThumbzone` to bind the React hook to. */
export const adapter = createReactThumbzoneAdapter({ beforeInit: hoistServerRenderedStyles })

export const { initThumbzone, liveThumbzone, hasThumbzoneOwner } = adapter
