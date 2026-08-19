/**
 * The Tailwind CSS port's adapter onto the shared behaviour.
 *
 * The open/close lifecycle, the focus trap, the pointer state machine, the
 * thumb-first reorder, the scroll-aware tucking and the teardown all come from
 * `core/behaviour.js`, and the wiring between this port's markup and that
 * behaviour is `shared/thumbzone-adapter.js`. What is left here is the one
 * thing that varies between ports built that way: what counts as an element
 * this port can wire.
 *
 * There is no ownership registry and no adoption path, unlike the two React
 * ports, because there is nothing to adopt: Tailwind has no runtime, the markup
 * is static HTML by the time the browser sees it, and the module script that
 * calls this is the only thing that ever claims these elements. The same
 * absence is why the demo route can honestly publish an already-resolved
 * `__thumbzoneReady`.
 */

import { createThumbzoneAdapter } from '../../../shared/thumbzone-adapter.js'

/**
 * Checked against `HTMLElement` rather than for truthiness: the refs are fed by
 * `querySelector`, so a selector that matched nothing arrives as `null` and one
 * that matched the wrong kind of node arrives without the properties the
 * behaviour will reach for. Both should fail at the call, naming what was
 * missing.
 */
export const { initThumbzone } = createThumbzoneAdapter({
  validate: (element) => element instanceof HTMLElement,
})
