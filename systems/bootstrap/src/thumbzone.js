/**
 * The Bootstrap 5 port's adapter onto the shared behaviour.
 *
 * The open/close lifecycle, the focus trap, the pointer state machine, the
 * thumb-first reorder, the scroll-aware tucking and the teardown all come from
 * `core/behaviour.js`, and the wiring between this port's markup and that
 * behaviour is `shared/thumbzone-adapter.js`. What is left here is the one
 * thing that varies between ports built that way: what counts as an element
 * this port can wire.
 *
 * Bootstrap's own `Offcanvas` is deliberately absent, and this file is where its
 * absence is felt: that component would have supplied a backdrop, a focus trap,
 * a body scroll lock, `aria-modal` and an Escape binding — every one of which
 * the pattern already owns, and none of which can have two owners. Bootstrap is
 * a dependency for its CSS alone; no Bootstrap JS is imported anywhere in this
 * port.
 */

import { createThumbzoneAdapter } from '../../../shared/thumbzone-adapter.js'

export const { initThumbzone } = createThumbzoneAdapter()
