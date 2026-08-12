/**
 * thumbzone — variant 1 (bottom trigger + bottom sheet), normative reference.
 * Zero dependencies, no build step.
 *
 * The behaviour itself lives in `core/behaviour.js`, shared with every port:
 * the attribute sequence, the focus trap, the gesture machine, the thumb-first
 * reorder and the teardown order are the pattern, not this system's reading of
 * it. What is genuinely this implementation's own is what is left here — its
 * exact motion values, and how it validates the elements it is handed.
 *
 * That this file is now thin is the point of the reference implementation, not
 * a loss of status: a port that reads it sees exactly the surface it has to
 * write for itself.
 */

import { createThumbzoneBehaviour } from '../../../core/behaviour.js'

/** Duration (ms) of the sheet's open/close transition. */
export const SHEET_TRANSITION_MS = 240

/** Easing of the sheet's open/close transition. */
export const SHEET_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)'

/** Duration (ms) every named transition collapses to under prefers-reduced-motion. */
export const REDUCED_MOTION_TRANSITION_MS = 1

// Guards against wiring the same sheet twice (e.g. a caller re-running init
// without destroying the previous instance first), which would otherwise leave
// two 'keydown' listeners on document reacting to every open sheet.
const initializedSheets = new WeakSet()

/**
 * Wire up a thumbzone sheet. Returns handles for programmatic control.
 * @param {{ trigger: HTMLElement, sheet: HTMLElement, scrim: HTMLElement, menu: HTMLElement, inertRoot: HTMLElement }} refs
 * @returns {{ open: () => void, close: () => void, destroy: () => void }}
 */
export function initThumbzone({ trigger, sheet, scrim, menu, inertRoot }) {
  const missing = Object.entries({ trigger, sheet, scrim, menu, inertRoot })
    .filter(([, el]) => !el)
    .map(([name]) => name)
  if (missing.length > 0) {
    throw new TypeError(`thumbzone: initThumbzone is missing required element(s): ${missing.join(', ')}`)
  }
  if (initializedSheets.has(sheet)) {
    throw new Error(
      'thumbzone: initThumbzone was already called for this sheet; call destroy() on the previous instance first',
    )
  }
  initializedSheets.add(sheet)

  const behaviour = createThumbzoneBehaviour({ trigger, sheet, scrim, menu, inertRoot })

  return {
    open: behaviour.open,
    close: behaviour.close,
    destroy() {
      behaviour.destroy()
      initializedSheets.delete(sheet)
    },
  }
}
