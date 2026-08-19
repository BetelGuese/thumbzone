/**
 * The shadcn/ui port's adapter onto the shared behaviour.
 *
 * The lifecycle, the focus trap, the pointer machine, the thumb-first reorder
 * and the teardown are `core/behaviour.js`'s, and the wiring between this
 * port's markup and that behaviour — including the ownership registry its
 * adoption design needs — is `shared/react/adapter.ts`. Nothing is left for
 * this port to add: unlike the Material UI port there is no server-rendered
 * style to hoist out of the markup first, because Tailwind emits a static
 * stylesheet, so nothing of the styling system lands between the menu and its
 * items. This file is therefore the whole of it.
 *
 * Vaul is deliberately absent. Its drawer converges with this pattern on the
 * dismiss ratio and on the exact easing curve, and it implements handle-only
 * dragging natively — but its fling threshold is 0.4 against this contract's
 * 0.5, hard-coded with no way to configure it, so letting it own the drag would
 * retune a shared constant while still passing every assertion.
 */

import { createReactThumbzoneAdapter } from '../../../shared/react/adapter'

export type { ThumbzoneRefs, ThumbzoneHandle } from '../../../shared/react/adapter'

/** This port's adapter. Exported for `useThumbzone` to bind the React hook to. */
export const adapter = createReactThumbzoneAdapter()

export const { initThumbzone, liveThumbzone, hasThumbzoneOwner } = adapter
