/**
 * The Tailwind CSS port's adapter onto the shared behaviour.
 *
 * The open/close lifecycle, the focus trap, the pointer state machine, the
 * thumb-first reorder, the scroll-aware tucking and the teardown all come from
 * `core/behaviour.js`. What is left here is what a port genuinely owns:
 * validating the elements it is handed, and refusing to wire one sheet twice.
 *
 * There is no ownership registry and no adoption path, unlike the two React
 * ports, because there is nothing to adopt: Tailwind has no runtime, the markup
 * is static HTML by the time the browser sees it, and the module script that
 * calls this is the only thing that ever claims these elements. The same
 * absence is why the demo route can honestly publish an already-resolved
 * `__thumbzoneReady`.
 */

import { createThumbzoneBehaviour } from '../../../core/behaviour.js'

/**
 * Guards against wiring the same sheet twice — a caller re-running init without
 * destroying the previous instance first, which would otherwise leave two
 * 'keydown' listeners on document reacting to every open sheet, and two owners
 * of one set of attributes.
 */
const initializedSheets = new WeakSet()

/**
 * The names of any of the five refs that is not an element we can wire.
 *
 * Checked against `HTMLElement` rather than for truthiness: this is fed by
 * `querySelector`, so a selector that matched nothing arrives as `null` and a
 * selector that matched the wrong kind of node arrives as something without the
 * properties the behaviour will reach for. Both should fail here, at the call,
 * naming what was missing — not later, on a property access with no context.
 *
 * @param {Record<string, unknown>} refs
 * @returns {string[]}
 */
function missingElements(refs) {
  return Object.entries(refs)
    .filter(([, element]) => !(element instanceof HTMLElement))
    .map(([name]) => name)
}

/**
 * Wires the pattern's behaviour over already-rendered contract markup.
 *
 * @param {{ trigger: Element | null, sheet: Element | null, scrim: Element | null, menu: Element | null, inertRoot: Element | null }} refs
 *   The trigger, sheet, scrim, menu, and the content to make inert while open.
 * @returns {{ open: () => void, close: () => void, destroy: () => void }}
 *   `open()` and `close()` are no-ops in the state they would produce;
 *   `destroy()` closes if open, restores the pre-init DOM and detaches every
 *   listener.
 * @throws {TypeError} If any of the five is absent or is not an HTMLElement.
 * @throws {Error} If this sheet already has a live instance.
 */
export function initThumbzone({ trigger, sheet, scrim, menu, inertRoot }) {
  const missing = missingElements({ trigger, sheet, scrim, menu, inertRoot })
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
