/**
 * The Chakra UI port's adapter onto the shared behaviour.
 *
 * The lifecycle, focus trap, pointer machine, thumb-first reorder and teardown
 * are `core/behaviour.js`'s, and the wiring — including the ownership registry
 * that lets a late mount adopt a running instance — is
 * `shared/react/adapter.ts`. What is left is the one thing that varies between
 * React ports: getting the styling system's server-rendered `<style>` elements
 * out of the pattern's markup before anything reads it.
 *
 * Chakra needs that, and measurably so: rendering a `Box as="nav"` of anchors
 * plus a `Button` emits five Emotion style elements, one of them nested inside
 * the menu itself. Material UI has the same need, so the hoist is shared rather
 * than restated here.
 *
 * Chakra's own `Drawer` is deliberately absent. It wraps Ark UI's Dialog, and a
 * closed Dialog server-renders no content at all — measured, with
 * `unmountOnExit` at its mounted default. The contract needs the sheet fully
 * rendered while closed: a page wires the pattern during load, the thumb-first
 * reorder has to happen before hydration, and the open transition needs
 * something to animate. None of that is possible against absent markup. Ark's
 * Dialog additionally owns the focus trap, Escape, scroll locking, outside
 * dismissal and hiding content below — though notably every one of those is a
 * configurable boolean, so it is the absent markup that rules it out rather
 * than the ownership.
 */

import { createReactThumbzoneAdapter } from '../../../shared/react/adapter'
import { hoistServerRenderedStyles } from '../../../shared/react/hoist-emotion'

export type { ThumbzoneRefs, ThumbzoneHandle } from '../../../shared/react/adapter'

/** This port's adapter. Exported for `useThumbzone` to bind the React hook to. */
export const adapter = createReactThumbzoneAdapter({ beforeInit: hoistServerRenderedStyles })

export const { initThumbzone, liveThumbzone, hasThumbzoneOwner } = adapter
