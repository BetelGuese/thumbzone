/**
 * The Tailwind CSS port's adapter onto the shared behaviour.
 *
 * The open/close lifecycle, the focus trap, the pointer state machine, the
 * thumb-first reorder, the scroll-aware tucking and the teardown all come from
 * `core/behaviour.js`, and the wiring between this port's markup and that
 * behaviour is `shared/thumbzone-adapter.js`. What is left here is the one
 * thing that varies between ports built that way: what counts as an element
 * this port can wire.
 */

import { createThumbzoneAdapter } from '../../../shared/thumbzone-adapter.js'

export const { initThumbzone } = createThumbzoneAdapter()
