/**
 * The adapter every framework-free port wires its markup through.
 *
 * Not in `core/`, and not because `core/` is for DOM-touching code —
 * `core/index.js`'s own doc comment says nothing there touches the DOM, so
 * `core/` is already two halves: the DOM-free maths and the shared behaviour.
 * This is a third kind, and the reason it earns its own home: the wiring
 * between a port's markup and the behaviour layer. A port supplies markup,
 * styling, motion tokens and the rule for what counts as an element it can
 * wire; everything the pattern *does* comes from `core/behaviour.js`.
 *
 * Parameterised on validation alone, because validation is the only thing
 * measured to vary. Every port imports the same `core/behaviour.js`, so a
 * `createBehaviour` seam would have nothing varying across it.
 *
 * There is no ownership registry and no adoption path here, unlike the React
 * adapter beside it. A framework-free port's markup is static HTML by the time
 * the browser sees it and the module script calling this is the only thing that
 * ever claims those elements — which is also why such a route can honestly
 * publish an already-resolved `__thumbzoneReady`.
 */

import { createThumbzoneBehaviour } from '../core/behaviour.js'

/**
 * Builds a port's initialiser over the shared behaviour.
 *
 * The guard is created per call rather than shared across every port built from
 * this module. Two ports never meet on one page, so a shared guard would be
 * harmless in practice — but it would make one port's teardown observable from
 * another's, which is a coupling with no purpose and no test covering it.
 *
 * @param {{ validate: (element: unknown) => boolean }} options
 *   `validate` decides whether a ref is something this port can wire. The
 *   reference implementation asks only for truthiness; the ports built on a
 *   design system check `instanceof HTMLElement`, because those are fed by
 *   `querySelector` and a selector matching the wrong kind of node should fail
 *   here, at the call, naming what was missing — not later, on a property
 *   access with no context.
 * @returns {{ initThumbzone: (refs: { trigger: Element | null, sheet: Element | null, scrim: Element | null, menu: Element | null, inertRoot: Element | null }) => { open: () => void, close: () => void, destroy: () => void } }}
 */
export function createThumbzoneAdapter({ validate }) {
  /**
   * Guards against wiring the same sheet twice — a caller re-running init
   * without destroying the previous instance first, which would otherwise leave
   * two 'keydown' listeners on document reacting to every open sheet, and two
   * owners of one set of attributes.
   */
  const initializedSheets = new WeakSet()

  return {
    /**
     * Wires the pattern's behaviour over already-rendered contract markup.
     *
     * @param {{ trigger: Element | null, sheet: Element | null, scrim: Element | null, menu: Element | null, inertRoot: Element | null }} refs
     *   The trigger, sheet, scrim, menu, and the content to make inert while open.
     * @returns {{ open: () => void, close: () => void, destroy: () => void }}
     *   `open()` and `close()` are no-ops in the state they would produce;
     *   `destroy()` closes if open, restores the pre-init DOM and detaches every
     *   listener.
     * @throws {TypeError} If any of the five is absent or fails `validate`.
     * @throws {Error} If this sheet already has a live instance.
     */
    initThumbzone({ trigger, sheet, scrim, menu, inertRoot }) {
      const refs = { trigger, sheet, scrim, menu, inertRoot }
      const missing = Object.entries(refs)
        .filter(([, element]) => !validate(element))
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

      const behaviour = createThumbzoneBehaviour(refs)

      return {
        open: behaviour.open,
        close: behaviour.close,
        destroy() {
          behaviour.destroy()
          initializedSheets.delete(sheet)
        },
      }
    },
  }
}
